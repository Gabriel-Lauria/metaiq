import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { randomBytes } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { AccessScopeService } from '../../../common/services/access-scope.service';
import { AuthenticatedUser } from '../../../common/interfaces';
import { IntegrationProvider, IntegrationStatus, Role, SyncStatus } from '../../../common/enums';
import { AdAccount } from '../../ad-accounts/ad-account.entity';
import { Campaign } from '../../campaigns/campaign.entity';
import { OAuthState } from '../oauth-state.entity';
import { StoreIntegration } from '../store-integration.entity';
import {
  ConnectMetaIntegrationDto,
  MetaAdAccountDto,
  MetaCampaignDto,
  MetaOAuthStartResponseDto,
  MetaSyncPlan,
  StoreIntegrationStatusDto,
  UpdateMetaIntegrationStatusDto,
} from './dto/meta-integration.dto';

@Injectable()
export class MetaIntegrationService {
  private readonly logger = new Logger(MetaIntegrationService.name);
  private readonly oauthStateTtlMs = 10 * 60 * 1000;

  constructor(
    @InjectRepository(StoreIntegration)
    private readonly integrationRepository: Repository<StoreIntegration>,
    @InjectRepository(OAuthState)
    private readonly oauthStateRepository: Repository<OAuthState>,
    @InjectRepository(AdAccount)
    private readonly adAccountRepository: Repository<AdAccount>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    private readonly accessScope: AccessScopeService,
    private readonly config: ConfigService,
  ) {}

  async getStatus(storeId: string, user: AuthenticatedUser): Promise<StoreIntegrationStatusDto> {
    await this.accessScope.validateStoreAccess(user, storeId);
    return this.toStatusDto(await this.getOrCreate(storeId));
  }

  async startOAuth(storeId: string, user: AuthenticatedUser): Promise<MetaOAuthStartResponseDto> {
    await this.validateCanManage(storeId, user);
    const appId = this.assertMetaOAuthConfigured();

    const state = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.oauthStateTtlMs);
    await this.invalidatePendingStates(storeId);
    await this.oauthStateRepository.save(
      this.oauthStateRepository.create({
        provider: IntegrationProvider.META,
        state,
        storeId,
        initiatedByUserId: user.id,
        expiresAt,
        usedAt: null,
      }),
    );

    const integration = await this.getOrCreate(storeId, true);
    integration.status = IntegrationStatus.CONNECTING;
    integration.lastSyncError = null;
    await this.integrationRepository.save(integration);

    const url = new URL(`https://www.facebook.com/${this.metaApiVersion()}/dialog/oauth`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', this.metaRedirectUri());
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.metaScopes().join(','));
    this.logAuthorizationUrl(url);

    return {
      authorizationUrl: url.toString(),
      expiresAt,
    };
  }

  async handleOAuthCallback(query: {
    code?: string;
    state?: string;
    error?: string;
    error_reason?: string;
    error_description?: string;
  }): Promise<{ redirectUrl: string }> {
    const frontendUrl = this.config.get<string>('app.frontendUrl') || 'http://localhost:4200';
    const stateValue = query.state;
    if (!stateValue) {
      return { redirectUrl: this.oauthResultUrl(frontendUrl, 'error', 'state ausente') };
    }

    const { oauthState, error: stateError, storeId: knownStoreId } = await this.consumeOAuthState(stateValue);
    if (stateError) {
      return { redirectUrl: this.oauthResultUrl(frontendUrl, 'error', stateError, knownStoreId) };
    }

    if (!oauthState) {
      return { redirectUrl: this.oauthResultUrl(frontendUrl, 'error', 'state invalido') };
    }

    if (query.error) {
      const message = this.sanitizeError(query.error_description || query.error_reason || query.error);
      await this.markIntegrationError(oauthState.storeId, message);
      return { redirectUrl: this.oauthResultUrl(frontendUrl, 'error', message, oauthState.storeId) };
    }

    if (!query.code) {
      const message = 'codigo de autorizacao ausente';
      await this.markIntegrationError(oauthState.storeId, message);
      return { redirectUrl: this.oauthResultUrl(frontendUrl, 'error', message, oauthState.storeId) };
    }

    try {
      const token = await this.exchangeCodeForToken(query.code);
      const providerUserId = await this.fetchProviderUserId(token.access_token);
      const integration = await this.getOrCreate(oauthState.storeId, true);
      integration.status = IntegrationStatus.CONNECTED;
      integration.accessToken = token.access_token;
      integration.refreshToken = null;
      integration.tokenType = token.token_type ?? 'bearer';
      integration.tokenExpiresAt = token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null;
      integration.grantedScopes = this.metaScopes().join(',');
      integration.providerUserId = providerUserId;
      integration.oauthConnectedAt = new Date();
      integration.lastSyncStatus = SyncStatus.NEVER_SYNCED;
      integration.lastSyncError = null;
      integration.metadata = {
        oauthProvider: IntegrationProvider.META,
        connectedByStateId: oauthState.id,
      };

      await this.integrationRepository.save(integration);
      return { redirectUrl: this.oauthResultUrl(frontendUrl, 'success', 'Meta conectada', oauthState.storeId) };
    } catch (err) {
      const message = this.sanitizeError((err as Error)?.message || 'falha ao trocar code por token');
      this.logger.error(`Meta OAuth callback failed for store ${oauthState.storeId}: ${message}`);
      await this.markIntegrationError(oauthState.storeId, message);
      return { redirectUrl: this.oauthResultUrl(frontendUrl, 'error', message, oauthState.storeId) };
    }
  }

  async connect(
    storeId: string,
    user: AuthenticatedUser,
    dto: ConnectMetaIntegrationDto,
  ): Promise<StoreIntegrationStatusDto> {
    this.assertDevConnectEnabled();
    await this.validateCanManage(storeId, user);
    const integration = await this.getOrCreate(storeId, true);

    integration.status = IntegrationStatus.CONNECTED;
    integration.externalBusinessId = dto.externalBusinessId ?? integration.externalBusinessId;
    integration.externalAdAccountId = dto.externalAdAccountId ?? integration.externalAdAccountId;
    integration.accessToken = dto.accessToken ?? integration.accessToken;
    integration.refreshToken = dto.refreshToken ?? integration.refreshToken;
    integration.tokenExpiresAt = dto.tokenExpiresAt ? new Date(dto.tokenExpiresAt) : integration.tokenExpiresAt;
    integration.metadata = {
      ...(integration.metadata ?? {}),
      ...(dto.metadata ?? {}),
      simulated: true,
      preparedAt: new Date().toISOString(),
    };
    integration.lastSyncStatus = SyncStatus.NEVER_SYNCED;
    integration.lastSyncError = null;

    return this.toStatusDto(await this.integrationRepository.save(integration));
  }

  async disconnect(storeId: string, user: AuthenticatedUser): Promise<StoreIntegrationStatusDto> {
    await this.validateCanManage(storeId, user);
    const integration = await this.getOrCreate(storeId, true);

    integration.status = IntegrationStatus.NOT_CONNECTED;
    integration.accessToken = null;
    integration.refreshToken = null;
    integration.tokenExpiresAt = null;
    integration.tokenType = null;
    integration.grantedScopes = null;
    integration.providerUserId = null;
    integration.lastSyncStatus = SyncStatus.NEVER_SYNCED;
    integration.lastSyncError = null;

    return this.toStatusDto(await this.integrationRepository.save(integration));
  }

  async updateStatus(
    storeId: string,
    user: AuthenticatedUser,
    dto: UpdateMetaIntegrationStatusDto,
  ): Promise<StoreIntegrationStatusDto> {
    this.assertDevConnectEnabled();
    await this.validateCanManage(storeId, user);
    const integration = await this.getOrCreate(storeId, true);

    integration.status = dto.status;
    if (dto.lastSyncStatus !== undefined) {
      integration.lastSyncStatus = dto.lastSyncStatus;
      integration.lastSyncAt = new Date();
    }
    if (dto.lastSyncError !== undefined) {
      integration.lastSyncError = dto.lastSyncError;
    }

    return this.toStatusDto(await this.integrationRepository.save(integration));
  }

  async buildSyncPlan(storeId: string, user: AuthenticatedUser): Promise<MetaSyncPlan> {
    await this.validateCanManage(storeId, user);
    return {
      storeId,
      provider: IntegrationProvider.META,
      steps: [
        'VALIDATE_STORE_CONNECTION',
        'FETCH_EXTERNAL_AD_ACCOUNTS',
        'UPSERT_AD_ACCOUNTS',
        'UPSERT_CAMPAIGNS',
        'UPSERT_METRICS',
        'RECORD_SYNC_RESULT',
      ],
    };
  }

  async fetchAdAccountsForStore(
    storeId: string,
    requester: AuthenticatedUser,
  ): Promise<MetaAdAccountDto[]> {
    await this.validateCanManage(storeId, requester);
    const integration = await this.getConnectedIntegrationWithToken(storeId);

    try {
      const accounts = await this.fetchAllMetaAdAccountPages(integration.accessToken);
      return this.normalizeMetaAdAccounts(accounts);
    } catch (err) {
      const errorCode = (err as any)?.response?.data?.error?.code;
      const status = (err as any)?.response?.status;
      const metaMessage = (err as any)?.response?.data?.error?.message;
      const isTokenInvalid = status === 401 || errorCode === 190;
      const message = isTokenInvalid
        ? 'TOKEN_INVALID'
        : this.sanitizeError(metaMessage || (err as Error)?.message || 'Erro ao buscar Ad Accounts da Meta');

      await this.markIntegrationError(storeId, message);
      throw new BadRequestException(
        isTokenInvalid
          ? 'Token Meta inválido ou expirado. Reconecte a store.'
          : `Erro ao buscar Ad Accounts da Meta: ${message}`,
      );
    }
  }

  async syncAdAccountsForStore(
    storeId: string,
    requester: AuthenticatedUser,
  ): Promise<MetaAdAccountDto[]> {
    const accounts = await this.fetchAdAccountsForStore(storeId, requester);
    const now = new Date();

    for (const account of accounts) {
      const existing = await this.adAccountRepository.findOne({
        where: {
          storeId,
          provider: IntegrationProvider.META,
          externalId: account.externalId,
        },
      });

      if (existing) {
        existing.name = account.name;
        existing.lastSeenAt = now;
        existing.active = account.status === 'ACTIVE';
        await this.adAccountRepository.save(existing);
        continue;
      }

      await this.adAccountRepository.save(
        this.adAccountRepository.create({
          metaId: account.externalId,
          externalId: account.externalId,
          provider: IntegrationProvider.META,
          syncStatus: SyncStatus.SUCCESS,
          importedAt: now,
          lastSeenAt: now,
          name: account.name,
          userId: requester.id,
          storeId,
          active: account.status === 'ACTIVE',
        }),
      );
    }

    const integration = await this.getOrCreate(storeId, true);
    integration.lastSyncAt = now;
    integration.lastSyncStatus = SyncStatus.SUCCESS;
    integration.lastSyncError = null;
    await this.integrationRepository.save(integration);

    return accounts;
  }

  async fetchCampaignsForAdAccount(
    storeId: string,
    adAccountId: string,
    requester: AuthenticatedUser,
  ): Promise<MetaCampaignDto[]> {
    await this.validateCanManage(storeId, requester);
    const integration = await this.getConnectedIntegrationWithToken(storeId);
    const adAccount = await this.getMetaAdAccountInStore(adAccountId, storeId);

    try {
      const campaigns = await this.fetchAllMetaCampaignPages(adAccount.externalId || adAccount.metaId, integration.accessToken);
      return this.normalizeMetaCampaigns(campaigns);
    } catch (err) {
      const errorCode = (err as any)?.response?.data?.error?.code;
      const status = (err as any)?.response?.status;
      const metaMessage = (err as any)?.response?.data?.error?.message;
      const isTokenInvalid = status === 401 || errorCode === 190;
      const message = isTokenInvalid
        ? 'TOKEN_INVALID'
        : this.sanitizeError(metaMessage || (err as Error)?.message || 'Erro ao buscar campanhas da Meta');

      await this.markIntegrationError(storeId, message);
      throw new BadRequestException(
        isTokenInvalid
          ? 'Token Meta inválido ou expirado. Reconecte a store.'
          : `Erro ao buscar campanhas da Meta: ${message}`,
      );
    }
  }

  async syncCampaignsForAdAccount(
    storeId: string,
    adAccountId: string,
    requester: AuthenticatedUser,
  ): Promise<MetaCampaignDto[]> {
    const adAccount = await this.getMetaAdAccountInStore(adAccountId, storeId);
    const campaigns = await this.fetchCampaignsForAdAccount(storeId, adAccountId, requester);
    const now = new Date();

    for (const campaign of campaigns) {
      const existing = await this.campaignRepository.findOne({
        where: {
          storeId,
          externalId: campaign.externalId,
        },
      });

      if (existing) {
        existing.name = campaign.name;
        existing.status = campaign.status;
        existing.adAccountId = adAccount.id;
        existing.lastSeenAt = now;
        await this.campaignRepository.save(existing);
        continue;
      }

      await this.campaignRepository.save(
        this.campaignRepository.create({
          metaId: campaign.externalId,
          externalId: campaign.externalId,
          name: campaign.name,
          status: campaign.status,
          objective: 'CONVERSIONS',
          dailyBudget: 0,
          startTime: now,
          userId: requester.id,
          createdByUserId: requester.id,
          storeId,
          adAccountId: adAccount.id,
          lastSeenAt: now,
        }),
      );
    }

    const integration = await this.getOrCreate(storeId, true);
    integration.lastSyncAt = now;
    integration.lastSyncStatus = SyncStatus.SUCCESS;
    integration.lastSyncError = null;
    await this.integrationRepository.save(integration);

    return campaigns;
  }

  private async validateCanManage(storeId: string, user: AuthenticatedUser): Promise<void> {
    await this.accessScope.validateStoreAccess(user, storeId);
    if (![Role.PLATFORM_ADMIN, Role.OPERATIONAL].includes(user.role)) {
      throw new ForbiddenException('Apenas PLATFORM_ADMIN e OPERATIONAL podem gerenciar integrações com Meta');
    }
  }

  private async getOrCreate(storeId: string, includeSecrets = false): Promise<StoreIntegration> {
    const query = this.integrationRepository
      .createQueryBuilder('integration')
      .where('integration.storeId = :storeId', { storeId })
      .andWhere('integration.provider = :provider', { provider: IntegrationProvider.META });

    if (includeSecrets) {
      query.addSelect(['integration.accessToken', 'integration.refreshToken']);
    }

    const existing = await query.getOne();
    if (existing) {
      return existing;
    }

    return this.integrationRepository.save(
      this.integrationRepository.create({
        storeId,
        provider: IntegrationProvider.META,
        status: IntegrationStatus.NOT_CONNECTED,
        lastSyncStatus: SyncStatus.NEVER_SYNCED,
      }),
    );
  }

  private async getConnectedIntegrationWithToken(storeId: string): Promise<StoreIntegration> {
    const integration = await this.getOrCreate(storeId, true);
    if (integration.status !== IntegrationStatus.CONNECTED) {
      throw new BadRequestException('Store não está conectada à Meta');
    }

    if (!integration.accessToken) {
      await this.markIntegrationError(storeId, 'TOKEN_INVALID');
      throw new BadRequestException('Token Meta ausente. Reconecte a store.');
    }

    return integration;
  }

  private async getMetaAdAccountInStore(adAccountId: string, storeId: string): Promise<AdAccount> {
    const adAccount = await this.adAccountRepository.findOne({
      where: {
        id: adAccountId,
        storeId,
        provider: IntegrationProvider.META,
      },
    });

    if (!adAccount) {
      throw new BadRequestException('AdAccount Meta não encontrada para a store informada');
    }

    if (!adAccount.externalId && !adAccount.metaId) {
      throw new BadRequestException('AdAccount Meta sem identificador externo');
    }

    return adAccount;
  }

  private normalizeMetaAdAccounts(rawAccounts: any[]): MetaAdAccountDto[] {
    return rawAccounts
      .filter((account) => account?.id)
      .map((account) => ({
        externalId: account.id,
        name: account.name || account.id,
        status: this.normalizeAdAccountStatus(account.account_status),
      }));
  }

  async fetchAdAccountsRaw(accessToken: string): Promise<any[]> {
    return this.fetchAllMetaAdAccountPages(accessToken);
  }

  async fetchCampaignsRaw(adAccountExternalId: string, accessToken: string): Promise<any[]> {
    return this.fetchAllMetaCampaignPages(adAccountExternalId, accessToken);
  }

  normalizeAdAccounts(rawAccounts: any[]): MetaAdAccountDto[] {
    return this.normalizeMetaAdAccounts(rawAccounts);
  }

  normalizeCampaigns(rawCampaigns: any[]): MetaCampaignDto[] {
    return this.normalizeMetaCampaigns(rawCampaigns);
  }

  private async fetchAllMetaAdAccountPages(accessToken: string): Promise<any[]> {
    const accounts: any[] = [];
    let nextUrl: string | null = `https://graph.facebook.com/${this.metaApiVersion()}/me/adaccounts`;
    let page = 0;
    const maxPages = 20;

    while (nextUrl && page < maxPages) {
      const isFirstPage = page === 0;
      const response = await axios.get(nextUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: isFirstPage
          ? {
              fields: 'id,name,account_status',
            }
          : undefined,
        timeout: 15000,
      });

      accounts.push(...(response.data?.data ?? []));
      nextUrl = response.data?.paging?.next ?? null;
      page += 1;
      if (nextUrl) {
        await this.sleep(150);
      }
    }

    return accounts;
  }

  private normalizeMetaCampaigns(rawCampaigns: any[]): MetaCampaignDto[] {
    return rawCampaigns
      .filter((campaign) => campaign?.id)
      .map((campaign) => ({
        externalId: campaign.id,
        name: campaign.name || campaign.id,
        status: this.normalizeCampaignStatus(campaign.status),
      }));
  }

  private async fetchAllMetaCampaignPages(adAccountExternalId: string, accessToken: string): Promise<any[]> {
    const campaigns: any[] = [];
    let nextUrl: string | null = `https://graph.facebook.com/${this.metaApiVersion()}/${adAccountExternalId}/campaigns`;
    let page = 0;
    const maxPages = 50;

    while (nextUrl && page < maxPages) {
      const isFirstPage = page === 0;
      const response = await axios.get(nextUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: isFirstPage
          ? {
              fields: 'id,name,status',
            }
          : undefined,
        timeout: 15000,
      });

      campaigns.push(...(response.data?.data ?? []));
      nextUrl = response.data?.paging?.next ?? null;
      page += 1;
      if (nextUrl) {
        await this.sleep(150);
      }
    }

    return campaigns;
  }

  private normalizeCampaignStatus(status: unknown): 'ACTIVE' | 'PAUSED' | 'ARCHIVED' {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'ACTIVE') {
      return 'ACTIVE';
    }
    if (normalized === 'ARCHIVED' || normalized === 'DELETED') {
      return 'ARCHIVED';
    }
    return 'PAUSED';
  }

  private normalizeAdAccountStatus(status: unknown): 'ACTIVE' | 'DISABLED' | 'UNSETTLED' | 'UNKNOWN' {
    if (Number(status) === 1) {
      return 'ACTIVE';
    }

    if (Number(status) === 2) {
      return 'DISABLED';
    }

    if (Number(status) === 3) {
      return 'UNSETTLED';
    }

    if (status === undefined || status === null) {
      return 'UNKNOWN';
    }

    return 'UNKNOWN';
  }

  private assertDevConnectEnabled(): void {
    if (this.config.get<string>('app.nodeEnv') === 'production') {
      throw new ForbiddenException('Fluxo manual de integração Meta não é permitido em produção');
    }

    if (!this.config.get<boolean>('meta.enableDevConnect')) {
      throw new ForbiddenException('Fluxo manual de integração Meta está desabilitado');
    }
  }

  private assertMetaOAuthConfigured(): string {
    const appId = this.config.get<string>('meta.appId')?.trim() || '';
    const appSecret = this.config.get<string>('meta.appSecret')?.trim() || '';
    const redirectUri = this.metaRedirectUri();

    if (!appId) {
      throw new BadRequestException('META_APP_ID não configurado. Use o App ID numérico do app Meta.');
    }

    if (!/^\d+$/.test(appId)) {
      throw new BadRequestException(
        `META_APP_ID inválido: esperado App ID numérico da Meta, recebido "${this.maskConfigValue(appId)}". Verifique se não foi usado App Secret, Business ID ou placeholder.`,
      );
    }

    if (!appSecret) {
      throw new BadRequestException('META_APP_SECRET não configurado. Use o App Secret do app Meta apenas no backend.');
    }

    try {
      new URL(redirectUri);
    } catch {
      throw new BadRequestException(
        `META_REDIRECT_URI inválido: "${redirectUri}". Deve ser uma URL absoluta e exatamente igual à cadastrada no app Meta.`,
      );
    }

    return appId;
  }

  private async invalidatePendingStates(storeId: string): Promise<void> {
    await this.oauthStateRepository.update(
      {
        provider: IntegrationProvider.META,
        storeId,
        usedAt: IsNull(),
      },
      { usedAt: new Date() },
    );
  }

  private async consumeOAuthState(state: string): Promise<{
    oauthState: OAuthState | null;
    error: string | null;
    storeId?: string;
  }> {
    const result = await this.oauthStateRepository
      .createQueryBuilder()
      .update(OAuthState)
      .set({ usedAt: () => 'CURRENT_TIMESTAMP' })
      .where('provider = :provider', { provider: IntegrationProvider.META })
      .andWhere('state = :state', { state })
      .andWhere('"usedAt" IS NULL')
      .andWhere('"expiresAt" > CURRENT_TIMESTAMP')
      .returning('*')
      .execute();

    if (result.raw?.length) {
      return {
        oauthState: result.raw[0] as OAuthState,
        error: null,
      };
    }

    const existing = await this.oauthStateRepository.findOne({
      where: { provider: IntegrationProvider.META, state },
    });

    if (!existing) {
      return { oauthState: null, error: 'state invalido' };
    }

    if (existing.usedAt) {
      return { oauthState: null, error: 'state ja utilizado', storeId: existing.storeId };
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      return { oauthState: null, error: 'state expirado', storeId: existing.storeId };
    }

    return { oauthState: null, error: 'state invalido', storeId: existing.storeId };
  }

  private async exchangeCodeForToken(code: string): Promise<{
    access_token: string;
    token_type?: string;
    expires_in?: number;
  }> {
    this.assertMetaOAuthConfigured();
    const response = await axios.get(`https://graph.facebook.com/${this.metaApiVersion()}/oauth/access_token`, {
      params: {
        client_id: this.config.get<string>('meta.appId'),
        redirect_uri: this.metaRedirectUri(),
        client_secret: this.config.get<string>('meta.appSecret'),
        code,
      },
      timeout: 15000,
    });

    if (!response.data?.access_token) {
      throw new Error('Meta nao retornou access token');
    }

    return response.data;
  }

  private async fetchProviderUserId(accessToken: string): Promise<string | null> {
    try {
      const response = await axios.get(`https://graph.facebook.com/${this.metaApiVersion()}/me`, {
        params: {
          fields: 'id',
          access_token: accessToken,
        },
        timeout: 10000,
      });
      return response.data?.id ?? null;
    } catch (err) {
      this.logger.warn(`Nao foi possivel obter providerUserId da Meta: ${(err as Error)?.message}`);
      return null;
    }
  }

  private async markIntegrationError(storeId: string, message: string): Promise<void> {
    const integration = await this.getOrCreate(storeId, true);
    integration.status = IntegrationStatus.ERROR;
    integration.lastSyncStatus = SyncStatus.ERROR;
    integration.lastSyncError = message;
    await this.integrationRepository.save(integration);
  }

  private oauthResultUrl(
    frontendUrl: string,
    result: 'success' | 'error',
    message: string,
    storeId?: string,
  ): string {
    const url = new URL('/manager/integrations', frontendUrl);
    url.searchParams.set('metaOAuth', result);
    url.searchParams.set('message', message);
    if (storeId) {
      url.searchParams.set('storeId', storeId);
    }
    return url.toString();
  }

  private metaApiVersion(): string {
    return this.config.get<string>('meta.apiVersion') || 'v19.0';
  }

  private metaRedirectUri(): string {
    return this.config.get<string>('meta.redirectUri') || '';
  }

  private metaScopes(): string[] {
    return this.config.get<string[]>('meta.oauthScopes') || ['ads_read', 'business_management'];
  }

  private logAuthorizationUrl(url: URL): void {
    const masked = new URL(url.toString());
    const clientId = masked.searchParams.get('client_id') || '';
    masked.searchParams.set('client_id', this.maskClientId(clientId));
    this.logger.log(
      [
        'Meta OAuth authorization URL generated',
        `client_id=${this.maskClientId(clientId)}`,
        `redirect_uri=${url.searchParams.get('redirect_uri') || ''}`,
        `scopes=${url.searchParams.get('scope') || ''}`,
        `authorizationUrl=${masked.toString()}`,
      ].join(' | '),
    );
  }

  private maskClientId(clientId: string): string {
    if (!clientId) return '[empty]';
    if (clientId.length <= 6) return `${clientId[0]}***${clientId[clientId.length - 1]}`;
    return `${clientId.slice(0, 4)}***${clientId.slice(-2)}`;
  }

  private maskConfigValue(value: string): string {
    if (!value) return '[empty]';
    if (value.length <= 8) return `${value[0] ?? ''}***${value[value.length - 1] ?? ''}`;
    return `${value.slice(0, 3)}***${value.slice(-3)}`;
  }

  private sanitizeError(message: string): string {
    return message.replace(/[?&](access_token|client_secret|code)=[^&\s]+/gi, '$1=[redacted]').slice(0, 500);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private toStatusDto(integration: StoreIntegration): StoreIntegrationStatusDto {
    return {
      id: integration.id,
      storeId: integration.storeId,
      provider: integration.provider,
      status: integration.status,
      externalBusinessId: integration.externalBusinessId,
      externalAdAccountId: integration.externalAdAccountId,
      tokenType: integration.tokenType,
      tokenExpiresAt: integration.tokenExpiresAt,
      grantedScopes: integration.grantedScopes
        ? integration.grantedScopes.split(',').map((scope) => scope.trim()).filter(Boolean)
        : [],
      providerUserId: integration.providerUserId,
      oauthConnectedAt: integration.oauthConnectedAt,
      lastSyncAt: integration.lastSyncAt,
      lastSyncStatus: integration.lastSyncStatus,
      lastSyncError: integration.lastSyncError ? this.sanitizeError(integration.lastSyncError) : null,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    };
  }
}
