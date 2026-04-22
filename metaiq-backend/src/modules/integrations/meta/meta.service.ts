import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { createHash, randomBytes } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { AccessScopeService } from '../../../common/services/access-scope.service';
import { AuthenticatedUser } from '../../../common/interfaces';
import { IntegrationProvider, IntegrationStatus, Role, SyncStatus } from '../../../common/enums';
import { AdAccount } from '../../ad-accounts/ad-account.entity';
import { Campaign } from '../../campaigns/campaign.entity';
import { OAuthState } from '../oauth-state.entity';
import { StoreIntegration } from '../store-integration.entity';
import {
  MetaCampaignCreation,
  MetaCampaignCreationStatus,
  MetaCampaignCreationStep,
} from './meta-campaign-creation.entity';
import { MetaCampaignOrchestrator } from './meta-campaign.orchestrator';
import { MetaGraphApiClient } from './meta-graph-api.client';
import {
  ConnectMetaIntegrationDto,
  CreateMetaCampaignDto,
  CreateMetaCampaignResponseDto,
  MetaAdAccountDto,
  MetaCampaignDto,
  MetaOAuthStartResponseDto,
  MetaPageDto,
  MetaSyncPlan,
  StoreIntegrationStatusDto,
  UpdateMetaPageDto,
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
    @InjectRepository(MetaCampaignCreation)
    private readonly campaignCreationRepository: Repository<MetaCampaignCreation>,
    private readonly accessScope: AccessScopeService,
    private readonly config: ConfigService,
    private readonly graphApi: MetaGraphApiClient,
    private readonly campaignOrchestrator: MetaCampaignOrchestrator,
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

  async fetchPagesForStore(
    storeId: string,
    requester: AuthenticatedUser,
  ): Promise<MetaPageDto[]> {
    await this.validateCanManage(storeId, requester);
    const integration = await this.getConnectedIntegrationWithToken(storeId);

    try {
      return this.normalizeMetaPages(await this.fetchPagesRaw(integration.accessToken as string));
    } catch (err) {
      const errorCode = (err as any)?.response?.data?.error?.code;
      const status = (err as any)?.response?.status;
      const metaMessage = (err as any)?.response?.data?.error?.message;
      const isTokenInvalid = status === 401 || errorCode === 190;
      const message = isTokenInvalid
        ? 'TOKEN_INVALID'
        : this.sanitizeError(metaMessage || (err as Error)?.message || 'Erro ao buscar páginas da Meta');

      if (isTokenInvalid) {
        await this.markIntegrationError(storeId, message);
        throw new BadRequestException('Token Meta inválido ou expirado. Reconecte a store.');
      }

      throw new BadRequestException(`Erro ao buscar páginas da Meta: ${message}`);
    }
  }

  async updatePage(
    storeId: string,
    requester: AuthenticatedUser,
    dto: UpdateMetaPageDto,
  ): Promise<StoreIntegrationStatusDto> {
    await this.validateCanManage(storeId, requester);
    const integration = await this.getConnectedIntegrationWithToken(storeId);
    const pages = await this.fetchPagesForStore(storeId, requester);
    const page = pages.find((item) => item.id === dto.pageId);

    if (!page) {
      throw new BadRequestException('Página Meta não encontrada entre as páginas acessíveis da integração.');
    }

    integration.metadata = {
      ...(integration.metadata ?? {}),
      pageId: page.id,
      pageName: dto.pageName?.trim() || page.name,
    };

    return this.toStatusDto(await this.integrationRepository.save(integration));
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
        existing.objective = campaign.objective ?? existing.objective ?? null;
        existing.dailyBudget = campaign.dailyBudget ?? existing.dailyBudget ?? null;
        existing.startTime = campaign.startTime ?? existing.startTime ?? null;
        existing.endTime = campaign.endTime ?? existing.endTime ?? null;
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
          objective: campaign.objective ?? null,
          dailyBudget: campaign.dailyBudget ?? null,
          startTime: campaign.startTime ?? null,
          endTime: campaign.endTime ?? null,
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

  async createCampaign(
    storeId: string,
    requester: AuthenticatedUser,
    dto: CreateMetaCampaignDto,
    requestId?: string,
  ): Promise<CreateMetaCampaignResponseDto> {
    await this.validateCanManage(storeId, requester);
    const idempotencyKey = this.resolveIdempotencyKey(storeId, requester.id, dto);
    const existingExecution = await this.findCampaignCreationByIdempotencyKey(storeId, idempotencyKey);

    if (existingExecution) {
      return this.resolveExistingCampaignCreation(existingExecution);
    }

    const integration = await this.getConnectedIntegrationWithToken(storeId);
    await this.validateMetaToken(storeId, integration.accessToken);
    this.assertRequiredMetaScopes(integration, ['ads_management']);

    const adAccount = await this.getMetaAdAccountForCampaign(dto.adAccountId, storeId);
    const adAccountExternalId = this.normalizeAdAccountExternalId(adAccount.externalId || adAccount.metaId);
    const pageId = this.getMetadataString(integration.metadata, ['pageId', 'metaPageId', 'facebookPageId']);
    if (!pageId) {
      throw new BadRequestException('Meta pageId é obrigatório para criar o criativo da campanha. Reconecte ou configure a página da store.');
    }

    const objective = this.normalizeCreateObjective(dto.objective);
    this.assertValidCampaignPayload(dto, objective);
    const destinationUrl =
      dto.destinationUrl?.trim()
      || this.getMetadataString(integration.metadata, ['destinationUrl', 'websiteUrl', 'objectUrl'])
      || '';
    if (!this.isValidHttpUrl(destinationUrl)) {
      throw new BadRequestException('destinationUrl é obrigatório para criar campanha Meta com destino de site');
    }
    const execution = await this.createCampaignCreationExecution(storeId, requester, adAccount, dto, idempotencyKey);
    const createdIds: Partial<Record<'campaignId' | 'adSetId' | 'creativeId' | 'adId', string>> = {};
    const startedAt = Date.now();

    this.logCampaignCreation('campaign creation started', {
      requestId,
      storeId,
      requesterId: requester.id,
      idempotencyKey,
      executionId: execution.id,
      adAccountId: adAccount.id,
      step: 'start',
      status: MetaCampaignCreationStatus.CREATING,
    });

    try {
      const ids = await this.campaignOrchestrator.createResources({
        adAccountExternalId,
        accessToken: integration.accessToken as string,
        dto,
        pageId,
        destinationUrl,
        objective,
        onStepCreated: async (step, idsFromStep) => {
          Object.assign(createdIds, idsFromStep);
          await this.markCampaignCreationStep(execution, step, createdIds);
          this.logCampaignCreation(`${step} created`, {
            requestId,
            storeId,
            requesterId: requester.id,
            idempotencyKey,
            executionId: execution.id,
            step,
            status: MetaCampaignCreationStatus.CREATING,
            ids: createdIds,
            duration: Date.now() - startedAt,
          });
        },
      });
      Object.assign(createdIds, ids);
    } catch (err) {
      await this.handleMetaMutationError(
        storeId,
        err,
        this.resolveFailedCampaignCreationStep(createdIds),
        createdIds,
        execution,
        requester.id,
        idempotencyKey,
        requestId,
        startedAt,
      );
    }

    try {
      const localCampaign = await this.recordCreatedCampaign(storeId, requester, dto, createdIds.campaignId as string, adAccount);
      await this.finishCampaignCreationExecution(execution, localCampaign.id, createdIds);
      this.logCampaignCreation('campaign creation finished', {
        requestId,
        storeId,
        requesterId: requester.id,
        idempotencyKey,
        executionId: execution.id,
        step: 'finish',
        status: MetaCampaignCreationStatus.ACTIVE,
        ids: createdIds,
        localCampaignId: localCampaign.id,
        duration: Date.now() - startedAt,
      });

      return {
        executionId: execution.id,
        idempotencyKey,
        campaignId: createdIds.campaignId as string,
        adSetId: createdIds.adSetId as string,
        creativeId: createdIds.creativeId as string,
        adId: createdIds.adId as string,
        status: 'CREATED',
        executionStatus: 'ACTIVE',
        initialStatus: dto.initialStatus === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
        storeId,
        adAccountId: adAccount.id,
        platform: 'META',
      };
    } catch (err) {
      await this.handleMetaMutationError(
        storeId,
        err,
        'persist',
        createdIds,
        execution,
        requester.id,
        idempotencyKey,
        requestId,
        startedAt,
      );
    }
  }

  async listCampaignCreations(filters: {
    storeId?: string;
    status?: MetaCampaignCreationStatus;
    limit?: number;
  }): Promise<MetaCampaignCreation[]> {
    const query = this.campaignCreationRepository
      .createQueryBuilder('creation')
      .leftJoinAndSelect('creation.store', 'store')
      .leftJoinAndSelect('creation.adAccount', 'adAccount')
      .leftJoinAndSelect('creation.campaign', 'campaign')
      .orderBy('creation.createdAt', 'DESC')
      .take(Math.min(Math.max(filters.limit ?? 50, 1), 200));

    if (filters.storeId) {
      query.andWhere('creation.storeId = :storeId', { storeId: filters.storeId });
    }

    if (filters.status) {
      query.andWhere('creation.status = :status', { status: filters.status });
    }

    return query.getMany();
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

    if (integration.tokenExpiresAt && integration.tokenExpiresAt.getTime() < Date.now()) {
      integration.status = IntegrationStatus.EXPIRED;
      integration.lastSyncStatus = SyncStatus.ERROR;
      integration.lastSyncError = 'TOKEN_EXPIRED';
      await this.integrationRepository.save(integration);
      throw new BadRequestException('Token Meta expirado. Reconecte a store.');
    }

    return integration;
  }

  private async validateMetaToken(storeId: string, accessToken: string | null): Promise<void> {
    if (!accessToken) {
      await this.markIntegrationError(storeId, 'TOKEN_INVALID');
      throw new BadRequestException('Token Meta ausente. Reconecte a store.');
    }

    try {
      await axios.get(`https://graph.facebook.com/${this.metaApiVersion()}/me`, {
        params: {
          fields: 'id',
          access_token: accessToken,
        },
        timeout: 10000,
      });
    } catch (err) {
      const errorCode = (err as any)?.response?.data?.error?.code;
      const status = (err as any)?.response?.status;
      if (status === 401 || errorCode === 190) {
        await this.markIntegrationError(storeId, 'TOKEN_INVALID');
        throw new BadRequestException('Token Meta inválido ou expirado. Reconecte a store.');
      }

      throw err;
    }
  }

  private assertRequiredMetaScopes(integration: StoreIntegration, requiredScopes: string[]): void {
    const grantedScopes = (integration.grantedScopes || '')
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean);
    const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope));

    if (missingScopes.length) {
      throw new BadRequestException(
        `Integração Meta sem permissão obrigatória (${missingScopes.join(', ')}). Reconecte a store com as permissões atualizadas.`,
      );
    }
  }

  private assertValidCampaignPayload(dto: CreateMetaCampaignDto, objective: string): void {
    const allowedObjectives = new Set(['OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'REACH', 'OUTCOME_SALES']);
    if (!allowedObjectives.has(objective)) {
      throw new BadRequestException(`Objetivo Meta não suportado no MVP: ${dto.objective}`);
    }

    if (!Number.isFinite(Number(dto.dailyBudget)) || Number(dto.dailyBudget) <= 0) {
      throw new BadRequestException('dailyBudget deve ser maior que zero');
    }

    if (!/^[A-Z]{2}$/.test(dto.country.trim().toUpperCase())) {
      throw new BadRequestException('country deve usar código ISO de 2 letras');
    }

    if (!dto.message.trim()) {
      throw new BadRequestException('message é obrigatório');
    }

    if (!this.isValidHttpUrl(dto.imageUrl)) {
      throw new BadRequestException('imageUrl deve ser uma URL http(s) válida');
    }

    if (dto.destinationUrl && !this.isValidHttpUrl(dto.destinationUrl)) {
      throw new BadRequestException('destinationUrl deve ser uma URL http(s) válida');
    }
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

  private async getMetaAdAccountForCampaign(adAccountId: string, storeId: string): Promise<AdAccount> {
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

    if (!adAccount.active) {
      throw new BadRequestException('AdAccount Meta inativa para a store informada');
    }

    if (adAccount.syncStatus !== SyncStatus.SUCCESS) {
      throw new BadRequestException('AdAccount Meta ainda não foi sincronizada corretamente');
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

  private normalizeMetaPages(rawPages: any[]): MetaPageDto[] {
    return rawPages
      .filter((page) => page?.id)
      .map((page) => ({
        id: String(page.id),
        name: page.name || page.id,
        category: page.category ?? null,
      }));
  }

  async fetchAdAccountsRaw(accessToken: string): Promise<any[]> {
    return this.fetchAllMetaAdAccountPages(accessToken);
  }

  async fetchPagesRaw(accessToken: string): Promise<any[]> {
    return this.fetchAllMetaPagePages(accessToken);
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

  private async fetchAllMetaPagePages(accessToken: string): Promise<any[]> {
    const pages: any[] = [];
    let nextUrl: string | null = `https://graph.facebook.com/${this.metaApiVersion()}/me/accounts`;
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
              fields: 'id,name,category',
            }
          : undefined,
        timeout: 15000,
      });

      pages.push(...(response.data?.data ?? []));
      nextUrl = response.data?.paging?.next ?? null;
      page += 1;
      if (nextUrl) {
        await this.sleep(150);
      }
    }

    return pages;
  }

  private normalizeMetaCampaigns(rawCampaigns: any[]): MetaCampaignDto[] {
    return rawCampaigns
      .filter((campaign) => campaign?.id)
      .map((campaign) => ({
        externalId: campaign.id,
        name: campaign.name || campaign.id,
        status: this.normalizeCampaignStatus(campaign.status),
        objective: this.normalizeImportedCampaignObjective(campaign.objective),
        dailyBudget: this.normalizeImportedCampaignBudget(campaign.daily_budget, campaign.lifetime_budget),
        startTime: this.normalizeImportedCampaignDate(campaign.start_time),
        endTime: this.normalizeImportedCampaignDate(campaign.stop_time),
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
              fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time',
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

  private async metaPost<T>(
    adAccountExternalId: string,
    edge: 'campaigns' | 'adsets' | 'adcreatives' | 'ads',
    accessToken: string | null,
    payload: Record<string, string | number>,
  ): Promise<T> {
    if (!accessToken) {
      throw new Error('TOKEN_INVALID');
    }

    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      body.set(key, String(value));
    }
    body.set('access_token', accessToken);

    const response = await axios.post(
      `https://graph.facebook.com/${this.metaApiVersion()}/${adAccountExternalId}/${edge}`,
      body,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 20000,
      },
    );

    if (!response.data?.id) {
      throw new Error(`Meta não retornou ID ao criar ${edge}`);
    }

    return response.data as T;
  }

  private async recordCreatedCampaign(
    storeId: string,
    requester: AuthenticatedUser,
    dto: CreateMetaCampaignDto,
    campaignId: string,
    adAccount: AdAccount,
  ): Promise<Campaign> {
    const existingCampaign = await this.campaignRepository.findOne({
      where: {
        storeId,
        externalId: campaignId,
      },
    });

    const now = new Date();
    if (existingCampaign) {
      existingCampaign.name = dto.name;
      existingCampaign.status = dto.initialStatus === 'ACTIVE' ? 'ACTIVE' : 'PAUSED';
      existingCampaign.objective = this.normalizeLocalObjective(dto.objective);
      existingCampaign.dailyBudget = dto.dailyBudget;
      existingCampaign.adAccountId = adAccount.id;
      existingCampaign.createdByUserId = existingCampaign.createdByUserId || requester.id;
      existingCampaign.lastSeenAt = now;
      return this.campaignRepository.save(existingCampaign);
    }

    return this.campaignRepository.save(
      this.campaignRepository.create({
        metaId: campaignId,
        externalId: campaignId,
        name: dto.name,
        status: dto.initialStatus === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
        objective: this.normalizeLocalObjective(dto.objective),
        dailyBudget: dto.dailyBudget,
        startTime: now,
        userId: requester.id,
        createdByUserId: requester.id,
        storeId,
        adAccountId: adAccount.id,
        lastSeenAt: now,
      }),
    );
  }

  private resolveIdempotencyKey(storeId: string, requesterId: string, dto: CreateMetaCampaignDto): string {
    const normalized = dto.idempotencyKey?.trim();
    if (normalized) {
      return normalized;
    }

    return createHash('sha256')
      .update(JSON.stringify({
        storeId,
        requesterId,
        name: dto.name.trim(),
        objective: dto.objective.trim().toUpperCase(),
        dailyBudget: Number(dto.dailyBudget),
        country: dto.country.trim().toUpperCase(),
        adAccountId: dto.adAccountId,
        message: dto.message.trim(),
        imageUrl: dto.imageUrl.trim(),
        destinationUrl: dto.destinationUrl?.trim() || null,
        headline: dto.headline?.trim() || null,
        description: dto.description?.trim() || null,
        cta: dto.cta?.trim() || null,
        initialStatus: dto.initialStatus || 'PAUSED',
      }))
      .digest('hex');
  }

  private async findCampaignCreationByIdempotencyKey(
    storeId: string,
    idempotencyKey: string,
  ): Promise<MetaCampaignCreation | null> {
    return this.campaignCreationRepository.findOne({
      where: {
        storeId,
        idempotencyKey,
      },
    });
  }

  private resolveExistingCampaignCreation(execution: MetaCampaignCreation): CreateMetaCampaignResponseDto {
    if (execution.status === MetaCampaignCreationStatus.ACTIVE) {
      if (!execution.metaCampaignId || !execution.metaAdSetId || !execution.metaCreativeId || !execution.metaAdId) {
        throw new ConflictException({
          message: 'Execução idempotente concluída sem todos os IDs externos. Verifique o histórico da campanha.',
          executionId: execution.id,
          executionStatus: execution.status,
          idempotencyKey: execution.idempotencyKey,
        });
      }

      return {
        executionId: execution.id,
        idempotencyKey: execution.idempotencyKey,
        campaignId: execution.metaCampaignId,
        adSetId: execution.metaAdSetId,
        creativeId: execution.metaCreativeId,
        adId: execution.metaAdId,
        status: 'CREATED',
        executionStatus: 'ACTIVE',
        initialStatus: execution.requestPayload?.['initialStatus'] === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
        storeId: execution.storeId,
        adAccountId: execution.adAccountId,
        platform: 'META',
      };
    }

    if (execution.status === MetaCampaignCreationStatus.CREATING) {
      throw new ConflictException({
        message: 'Criação de campanha já está em andamento para esta idempotencyKey.',
        executionId: execution.id,
        executionStatus: execution.status,
        idempotencyKey: execution.idempotencyKey,
      });
    }

    throw new BadRequestException({
      message: 'Já existe uma execução anterior não concluída para esta idempotencyKey. Use outra chave após validar os recursos parciais na Meta.',
      executionId: execution.id,
      executionStatus: execution.status,
      idempotencyKey: execution.idempotencyKey,
      step: execution.errorStep,
      partialIds: this.executionIds(execution),
      errorMessage: execution.errorMessage,
    });
  }

  private async createCampaignCreationExecution(
    storeId: string,
    requester: AuthenticatedUser,
    adAccount: AdAccount,
    dto: CreateMetaCampaignDto,
    idempotencyKey: string,
  ): Promise<MetaCampaignCreation> {
    try {
      return await this.campaignCreationRepository.save(
        this.campaignCreationRepository.create({
          storeId,
          requesterUserId: requester.id,
          adAccountId: adAccount.id,
          idempotencyKey,
          status: MetaCampaignCreationStatus.CREATING,
          requestPayload: {
            name: dto.name,
            objective: dto.objective,
            dailyBudget: dto.dailyBudget,
            country: dto.country,
            adAccountId: dto.adAccountId,
            message: dto.message,
            imageUrl: dto.imageUrl,
            destinationUrl: dto.destinationUrl,
            headline: dto.headline,
            description: dto.description,
            cta: dto.cta,
            initialStatus: dto.initialStatus || 'PAUSED',
          },
        }),
      );
    } catch (err) {
      if (idempotencyKey && this.isUniqueConstraintError(err)) {
        const existing = await this.findCampaignCreationByIdempotencyKey(storeId, idempotencyKey);
        if (existing) {
          throw new ConflictException({
            message: 'Criação de campanha já registrada para esta idempotencyKey. Repita a requisição para obter o resultado atual.',
            executionId: existing.id,
            executionStatus: existing.status,
            idempotencyKey,
          });
        }
      }

      throw err;
    }
  }

  private async markCampaignCreationStep(
    execution: MetaCampaignCreation,
    step: MetaCampaignCreationStep,
    ids: Partial<Record<'campaignId' | 'adSetId' | 'creativeId' | 'adId', string>>,
  ): Promise<void> {
    if (step === 'campaign') {
      execution.campaignCreated = true;
      execution.metaCampaignId = ids.campaignId ?? execution.metaCampaignId;
    }
    if (step === 'adset') {
      execution.adSetCreated = true;
      execution.metaAdSetId = ids.adSetId ?? execution.metaAdSetId;
    }
    if (step === 'creative') {
      execution.creativeCreated = true;
      execution.metaCreativeId = ids.creativeId ?? execution.metaCreativeId;
    }
    if (step === 'ad') {
      execution.adCreated = true;
      execution.metaAdId = ids.adId ?? execution.metaAdId;
    }

    await this.campaignCreationRepository.save(execution);
  }

  private async finishCampaignCreationExecution(
    execution: MetaCampaignCreation,
    campaignId: string,
    ids: Partial<Record<'campaignId' | 'adSetId' | 'creativeId' | 'adId', string>>,
  ): Promise<void> {
    execution.status = MetaCampaignCreationStatus.ACTIVE;
    execution.campaignId = campaignId;
    execution.campaignCreated = true;
    execution.adSetCreated = true;
    execution.creativeCreated = true;
    execution.adCreated = true;
    execution.metaCampaignId = ids.campaignId ?? execution.metaCampaignId;
    execution.metaAdSetId = ids.adSetId ?? execution.metaAdSetId;
    execution.metaCreativeId = ids.creativeId ?? execution.metaCreativeId;
    execution.metaAdId = ids.adId ?? execution.metaAdId;
    execution.errorStep = null;
    execution.errorMessage = null;
    await this.campaignCreationRepository.save(execution);
  }

  private async failCampaignCreationExecution(
    execution: MetaCampaignCreation,
    step: MetaCampaignCreationStep,
    message: string,
    ids: Partial<Record<'campaignId' | 'adSetId' | 'creativeId' | 'adId', string>>,
  ): Promise<void> {
    const hasPartialMetaResources = Boolean(ids.campaignId || ids.adSetId || ids.creativeId || ids.adId);
    execution.status = step === 'persist'
      ? MetaCampaignCreationStatus.FAILED
      : hasPartialMetaResources
      ? MetaCampaignCreationStatus.PARTIAL
      : MetaCampaignCreationStatus.FAILED;
    execution.errorStep = step;
    execution.errorMessage = message;
    execution.metaCampaignId = ids.campaignId ?? execution.metaCampaignId;
    execution.metaAdSetId = ids.adSetId ?? execution.metaAdSetId;
    execution.metaCreativeId = ids.creativeId ?? execution.metaCreativeId;
    execution.metaAdId = ids.adId ?? execution.metaAdId;
    execution.campaignCreated = Boolean(execution.metaCampaignId);
    execution.adSetCreated = Boolean(execution.metaAdSetId);
    execution.creativeCreated = Boolean(execution.metaCreativeId);
    execution.adCreated = Boolean(execution.metaAdId);
    await this.campaignCreationRepository.save(execution);
  }

  private executionIds(execution: MetaCampaignCreation): Partial<Record<'campaignId' | 'adSetId' | 'creativeId' | 'adId', string>> {
    return {
      ...(execution.metaCampaignId ? { campaignId: execution.metaCampaignId } : {}),
      ...(execution.metaAdSetId ? { adSetId: execution.metaAdSetId } : {}),
      ...(execution.metaCreativeId ? { creativeId: execution.metaCreativeId } : {}),
      ...(execution.metaAdId ? { adId: execution.metaAdId } : {}),
    };
  }

  private isUniqueConstraintError(err: unknown): boolean {
    const code = (err as any)?.code;
    return code === '23505' || code === 'SQLITE_CONSTRAINT';
  }

  private logCampaignCreation(message: string, payload: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({ event: 'META_CAMPAIGN_CREATION', message, ...payload }));
  }

  private async handleMetaMutationError(
    storeId: string,
    err: unknown,
    step: MetaCampaignCreationStep,
    createdIds: Partial<Record<'campaignId' | 'adSetId' | 'creativeId' | 'adId', string>>,
    execution: MetaCampaignCreation,
    requesterId: string,
    idempotencyKey: string,
    requestId?: string,
    startedAt?: number,
  ): Promise<never> {
    const errorCode = (err as any)?.response?.data?.error?.code;
    const status = (err as any)?.response?.status;
    const subcode = (err as any)?.response?.data?.error?.error_subcode;
    const fbtraceId = (err as any)?.response?.data?.error?.fbtrace_id;
    const metaMessage = (err as any)?.response?.data?.error?.message;
    const message = this.sanitizeError(metaMessage || (err as Error)?.message || `Erro ao criar campanha na Meta`);
    await this.failCampaignCreationExecution(execution, step, message, createdIds);

    this.logger.warn(
      JSON.stringify({
        event: 'META_CAMPAIGN_CREATION_FAILED',
        requestId,
        storeId,
        requesterId,
        idempotencyKey,
        executionId: execution.id,
        step,
        status: execution.status,
        metaCode: errorCode ?? null,
        metaSubcode: subcode ?? null,
        fbtraceId: fbtraceId ?? null,
        partialIds: createdIds,
        error: message,
        duration: startedAt ? Date.now() - startedAt : undefined,
      }),
    );

    if (status === 401 || errorCode === 190 || message === 'TOKEN_INVALID') {
      await this.markIntegrationError(storeId, 'TOKEN_INVALID');
      throw new HttpException({
        message: 'Token Meta inválido ou expirado. Reconecte a store.',
        executionId: execution.id,
        executionStatus: execution.status,
        step,
        partialIds: createdIds,
      }, HttpStatus.UNAUTHORIZED);
    }

    await this.recordCampaignCreationFailure(storeId, step, message, createdIds);

    if (status === 429 || errorCode === 4) {
      throw new HttpException({
        message: 'A Meta limitou temporariamente as requisições. Tente novamente em alguns minutos.',
        executionId: execution.id,
        executionStatus: execution.status,
        step,
        partialIds: createdIds,
      }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const isMetaValidationError = status === 400 || errorCode === 100;
    const response = {
      message: `Não foi possível criar campanha na Meta na etapa ${step}: ${message}`,
      executionId: execution.id,
      executionStatus: execution.status,
      step,
      partialIds: createdIds,
    };

    if (isMetaValidationError) {
      throw new BadRequestException(response);
    }

    throw new HttpException(response, HttpStatus.BAD_GATEWAY);
  }

  private async recordCampaignCreationFailure(
    storeId: string,
    step: string,
    message: string,
    createdIds: Partial<Record<'campaignId' | 'adSetId' | 'creativeId' | 'adId', string>>,
  ): Promise<void> {
    const integration = await this.getOrCreate(storeId, true);
    integration.lastSyncAt = new Date();
    integration.lastSyncStatus = SyncStatus.ERROR;
    integration.lastSyncError = this.sanitizeError(
      JSON.stringify({
        code: 'META_CAMPAIGN_CREATION_FAILED',
        step,
        message,
        partialIds: createdIds,
      }),
    );
    await this.integrationRepository.save(integration);
  }

  private resolveFailedCampaignCreationStep(
    createdIds: Partial<Record<'campaignId' | 'adSetId' | 'creativeId' | 'adId', string>>,
  ): 'campaign' | 'adset' | 'creative' | 'ad' {
    if (!createdIds.campaignId) return 'campaign';
    if (!createdIds.adSetId) return 'adset';
    if (!createdIds.creativeId) return 'creative';
    return 'ad';
  }

  private normalizeAdAccountExternalId(adAccountId: string): string {
    const normalized = adAccountId.trim();
    if (normalized.startsWith('act_')) {
      return normalized;
    }

    return `act_${normalized}`;
  }

  private normalizeCreateObjective(objective: string): string {
    const normalized = objective.trim().toUpperCase();
    if (normalized === 'TRAFFIC') {
      return 'OUTCOME_TRAFFIC';
    }

    return normalized || 'OUTCOME_TRAFFIC';
  }

  private normalizeLocalObjective(objective: string): 'CONVERSIONS' | 'REACH' | 'TRAFFIC' | 'LEADS' {
    const normalized = objective.trim().toUpperCase();
    if (normalized === 'REACH') return 'REACH';
    if (normalized === 'LEADS' || normalized === 'OUTCOME_LEADS') return 'LEADS';
    if (normalized === 'CONVERSIONS' || normalized === 'OUTCOME_SALES') return 'CONVERSIONS';
    return 'TRAFFIC';
  }

  private normalizeImportedCampaignObjective(
    objective: unknown,
  ): 'CONVERSIONS' | 'REACH' | 'TRAFFIC' | 'LEADS' | null {
    if (typeof objective !== 'string' || !objective.trim()) {
      return null;
    }

    const normalized = objective.trim().toUpperCase();
    if (normalized.includes('LEAD')) return 'LEADS';
    if (normalized.includes('REACH') || normalized.includes('AWARENESS')) return 'REACH';
    if (normalized.includes('TRAFFIC') || normalized.includes('CLICK')) return 'TRAFFIC';
    if (
      normalized.includes('CONVERSION')
      || normalized.includes('SALE')
      || normalized.includes('APP_INSTALL')
      || normalized.includes('ENGAGEMENT')
      || normalized.includes('MESSAGES')
    ) {
      return 'CONVERSIONS';
    }

    return null;
  }

  private normalizeImportedCampaignBudget(
    dailyBudget: unknown,
    lifetimeBudget: unknown,
  ): number | null {
    const rawValue = dailyBudget ?? lifetimeBudget;
    const numeric = Number(rawValue);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  private normalizeImportedCampaignDate(value: unknown): Date | null {
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private getMetadataString(metadata: Record<string, unknown> | null, keys: string[]): string | null {
    if (!metadata) {
      return null;
    }

    for (const key of keys) {
      const value = metadata[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
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

  private isValidHttpUrl(value?: string | null): boolean {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return false;
    }

    try {
      const parsed = new URL(normalized);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
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
    return this.config.get<string[]>('meta.oauthScopes') || ['ads_read', 'ads_management', 'business_management'];
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
      pageId: this.getMetadataString(integration.metadata, ['pageId', 'metaPageId', 'facebookPageId']),
      pageName: this.getMetadataString(integration.metadata, ['pageName', 'metaPageName', 'facebookPageName']),
      oauthConnectedAt: integration.oauthConnectedAt,
      lastSyncAt: integration.lastSyncAt,
      lastSyncStatus: integration.lastSyncStatus,
      lastSyncError: integration.lastSyncError ? this.sanitizeError(integration.lastSyncError) : null,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    };
  }
}
