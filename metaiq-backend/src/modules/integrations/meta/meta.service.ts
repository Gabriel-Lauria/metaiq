import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { createHash, randomBytes } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { AccessScopeService } from '../../../common/services/access-scope.service';
import { AuthenticatedUser } from '../../../common/interfaces';
import { IntegrationProvider, IntegrationStatus, Role, SyncStatus } from '../../../common/enums';
import { AssetsService } from '../../assets/assets.service';
import { AdAccount } from '../../ad-accounts/ad-account.entity';
import { Campaign } from '../../campaigns/campaign.entity';
import { IbgeService } from '../../ibge/ibge.service';
import { OAuthState } from '../oauth-state.entity';
import { StoreIntegration } from '../store-integration.entity';
import {
  MetaCampaignCreation,
  MetaCampaignCreationStatus,
  MetaCampaignCreationStep,
  MetaCampaignExecutionIds,
  MetaCampaignExecutionStepStateMap,
} from './meta-campaign-creation.entity';
import { MetaCampaignOrchestrator } from './meta-campaign.orchestrator';
import { normalizeCampaignLocation } from './meta-audience-location.util';
import { isLikelyDirectImageUrl, isValidMetaHttpUrl, isValidMetaHttpsUrl } from './meta-creative.validation';
import { MetaGraphApiClient } from './meta-graph-api.client';
import { normalizeMetaCtaType } from './meta-cta.constants';
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

type MetaCampaignCreationIds = Partial<Record<'campaignId' | 'adSetId' | 'creativeId' | 'adId', string>>;
const META_CAMPAIGN_EXECUTION_STEPS: MetaCampaignCreationStep[] = ['campaign', 'adset', 'creative', 'ad', 'persist'];

interface ValidatedMetaCampaignContext {
  adAccount: AdAccount;
  adAccountExternalId: string;
  pageId: string;
  destinationUrl: string;
  objective: string;
}

const SUPPORTED_META_CREATE_OBJECTIVES = new Set(['OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'REACH']);
const SUPPORTED_META_PLACEMENTS = new Set([
  'feed',
  'stories',
  'reels',
  'explore',
  'messenger',
  'audience_network',
]);
const SUPPORTED_META_SPECIAL_AD_CATEGORIES = new Set([
  'CREDIT',
  'EMPLOYMENT',
  'HOUSING',
  'ISSUES_ELECTIONS_POLITICS',
  'NONE',
]);

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
    private readonly assetsService: AssetsService,
    private readonly config: ConfigService,
    private readonly graphApi: MetaGraphApiClient,
    private readonly campaignOrchestrator: MetaCampaignOrchestrator,
    private readonly ibgeService: IbgeService,
  ) {}

  async getStatusForUser(user: AuthenticatedUser, storeId: string): Promise<StoreIntegrationStatusDto> {
    await this.accessScope.validateStoreAccess(user, storeId);
    return this.toStatusDto(await this.getOrCreate(storeId));
  }

  async startOAuthForUser(user: AuthenticatedUser, storeId: string): Promise<MetaOAuthStartResponseDto> {
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

  async connectForUser(
    user: AuthenticatedUser,
    storeId: string,
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

  async disconnectForUser(user: AuthenticatedUser, storeId: string): Promise<StoreIntegrationStatusDto> {
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

  async updateStatusForUser(
    user: AuthenticatedUser,
    storeId: string,
    dto: UpdateMetaIntegrationStatusDto,
  ): Promise<StoreIntegrationStatusDto> {
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

  async buildSyncPlanForUser(user: AuthenticatedUser, storeId: string): Promise<MetaSyncPlan> {
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

  async fetchPagesForStoreForUser(
    requester: AuthenticatedUser,
    storeId: string,
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

  async updatePageForUser(
    requester: AuthenticatedUser,
    storeId: string,
    dto: UpdateMetaPageDto,
  ): Promise<StoreIntegrationStatusDto> {
    await this.validateCanManage(storeId, requester);
    const integration = await this.getConnectedIntegrationWithToken(storeId);
    const pages = await this.fetchPagesForStoreForUser(requester, storeId);
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

  async fetchAdAccountsForStoreForUser(
    requester: AuthenticatedUser,
    storeId: string,
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

  async syncAdAccountsForStoreForUser(
    requester: AuthenticatedUser,
    storeId: string,
  ): Promise<MetaAdAccountDto[]> {
    const accounts = await this.fetchAdAccountsForStoreForUser(requester, storeId);
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

  async fetchCampaignsForAdAccountForUser(
    requester: AuthenticatedUser,
    storeId: string,
    adAccountId: string,
  ): Promise<MetaCampaignDto[]> {
    await this.validateCanManage(storeId, requester);
    const integration = await this.getConnectedIntegrationWithToken(storeId);
    const adAccount = await this.getMetaAdAccountInStore(adAccountId, storeId, requester);

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

  async syncCampaignsForAdAccountForUser(
    requester: AuthenticatedUser,
    storeId: string,
    adAccountId: string,
  ): Promise<MetaCampaignDto[]> {
    const adAccount = await this.getMetaAdAccountInStore(adAccountId, storeId, requester);
    const campaigns = await this.fetchCampaignsForAdAccountForUser(requester, storeId, adAccountId);
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

  async createCampaignForUser(
    requester: AuthenticatedUser,
    storeId: string,
    dto: CreateMetaCampaignDto,
    requestId?: string,
  ): Promise<CreateMetaCampaignResponseDto> {
    await this.validateCanManage(storeId, requester);
    const normalizedDto = await this.resolveAssetBackedCampaignDto(
      storeId,
      this.normalizeCreateCampaignDto(dto),
    );
    const requestPayload = this.buildCampaignCreationPayload(storeId, requester.id, normalizedDto);
    const payloadHash = this.hashPayload(requestPayload);
    const idempotencyKey = this.resolveIdempotencyKey(payloadHash, normalizedDto);
    const existingExecution = await this.findCampaignCreationByIdempotencyKey(storeId, idempotencyKey);

    if (existingExecution) {
      this.assertSameCampaignCreationPayload(existingExecution, payloadHash);
      return this.resolveExistingCampaignCreation(existingExecution);
    }

    const integration = await this.getConnectedIntegrationWithToken(storeId);
    await this.validateMetaToken(storeId, integration.accessToken);
    this.assertRequiredMetaScopes(integration, ['ads_management']);
    const validation = await this.validateCampaignCreationPrerequisites(storeId, requester, normalizedDto, integration);
    const execution = await this.createCampaignCreationExecution(
      storeId,
      requester,
      validation.adAccount,
      requestPayload,
      payloadHash,
      idempotencyKey,
    );
    const createdIds: MetaCampaignCreationIds = {};
    const startedAt = Date.now();

    this.logCampaignCreation('campaign creation started', {
      requestId,
      storeId,
      requesterId: requester.id,
      idempotencyKey,
      executionId: execution.id,
      adAccountId: validation.adAccount.id,
      step: 'start',
      status: MetaCampaignCreationStatus.IN_PROGRESS,
      payload: this.buildMetaValidationPayloadLog(normalizedDto, validation),
    });

    try {
      const ids = await this.campaignOrchestrator.createResources({
        adAccountExternalId: validation.adAccountExternalId,
        accessToken: integration.accessToken as string,
        dto: normalizedDto,
        pageId: validation.pageId,
        destinationUrl: validation.destinationUrl,
        objective: validation.objective,
        requestId,
        executionId: execution.id,
        storeId,
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
            status: MetaCampaignCreationStatus.IN_PROGRESS,
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
        normalizedDto,
        validation,
      );
    }

    try {
      const localCampaign = await this.recordCreatedCampaign(
        storeId,
        requester,
        normalizedDto,
        createdIds.campaignId as string,
        validation.adAccount,
      );
      await this.finishCampaignCreationExecution(execution, localCampaign.id, createdIds);
      this.logCampaignCreation('campaign creation finished', {
        requestId,
        storeId,
        requesterId: requester.id,
        idempotencyKey,
        executionId: execution.id,
        step: 'finish',
        status: MetaCampaignCreationStatus.COMPLETED,
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
        executionStatus: 'COMPLETED',
        initialStatus: normalizedDto.initialStatus === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
        storeId,
        adAccountId: validation.adAccount.id,
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
        normalizedDto,
        validation,
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
    if (![Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL].includes(user.role)) {
      throw new ForbiddenException('Apenas PLATFORM_ADMIN, ADMIN, MANAGER e OPERATIONAL podem gerenciar integrações com Meta');
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

  private assertValidCampaignPayload(dto: CreateMetaCampaignDto, objective: string, destinationUrl: string): void {
    if (!SUPPORTED_META_CREATE_OBJECTIVES.has(objective)) {
      throw new BadRequestException(`Objetivo Meta ainda não suportado para publicação segura: ${dto.objective}`);
    }

    if (!dto.name?.trim()) {
      throw new BadRequestException('name é obrigatório para criar campaign, adset, creative e ad.');
    }

    if (dto.name.trim().length > 120) {
      throw new BadRequestException('name excede o limite de 120 caracteres.');
    }

    if (!Number.isFinite(Number(dto.dailyBudget)) || Number(dto.dailyBudget) <= 0) {
      throw new BadRequestException('dailyBudget deve ser maior que zero para criar o adset.');
    }

    const startAt = Date.parse(dto.startTime);
    if (!Number.isFinite(startAt)) {
      throw new BadRequestException('startTime deve ser uma data válida em ISO-8601.');
    }

    if (dto.endTime) {
      const endAt = Date.parse(dto.endTime);
      if (!Number.isFinite(endAt)) {
        throw new BadRequestException('endTime deve ser uma data válida em ISO-8601.');
      }

      if (endAt <= startAt) {
        throw new BadRequestException('endTime deve ser posterior ao startTime.');
      }
    }

    if (!/^[A-Z]{2}$/.test(dto.country.trim().toUpperCase())) {
      throw new BadRequestException('country deve usar código ISO de 2 letras');
    }

    if (!dto.message.trim()) {
      throw new BadRequestException('message é obrigatório para criar o criativo.');
    }

    if (dto.message.trim().length > 500) {
      throw new BadRequestException('message excede o limite de 500 caracteres.');
    }

    if (dto.headline && dto.headline.trim().length > 80) {
      throw new BadRequestException('headline excede o limite de 80 caracteres.');
    }

    if (dto.description && dto.description.trim().length > 120) {
      throw new BadRequestException('description excede o limite de 120 caracteres.');
    }

    if (!dto.imageUrl || !isValidMetaHttpUrl(dto.imageUrl)) {
      throw new BadRequestException('imageUrl deve ser uma URL http(s) válida');
    }

    if (!isLikelyDirectImageUrl(dto.imageUrl)) {
      throw new BadRequestException('imageUrl deve apontar para uma imagem direta válida');
    }

    if (!isValidMetaHttpsUrl(destinationUrl)) {
      throw new BadRequestException('destination_url inválido. Use uma URL https válida para o criativo.');
    }

    if (!dto.placements?.length) {
      throw new BadRequestException('placements é obrigatório. Selecione ao menos um posicionamento real para a entrega.');
    }

    const invalidPlacements = (dto.placements || []).filter((placement) => !SUPPORTED_META_PLACEMENTS.has(placement));
    if (invalidPlacements.length) {
      throw new BadRequestException(`Placements inválidos para a Meta: ${invalidPlacements.join(', ')}`);
    }

    if (objective === 'OUTCOME_LEADS') {
      if (!dto.pixelId?.trim()) {
        throw new BadRequestException('Campanhas de leads exigem pixel configurado antes da publicação.');
      }

      if (!dto.conversionEvent?.trim()) {
        throw new BadRequestException('Campanhas de leads exigem conversionEvent para otimização real na Meta.');
      }
    }

    const invalidCategories = (dto.specialAdCategories || [])
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)
      .filter((item) => !SUPPORTED_META_SPECIAL_AD_CATEGORIES.has(item));

    if (invalidCategories.length) {
      throw new BadRequestException(`specialAdCategories inválidas: ${invalidCategories.join(', ')}`);
    }
  }

  private async getMetaAdAccountInStore(
    adAccountId: string,
    storeId: string,
    requester: AuthenticatedUser,
  ): Promise<AdAccount> {
    const adAccount = await this.accessScope.validateAdAccountInStoreAccess(
      requester,
      storeId,
      adAccountId,
    );
    if (adAccount.provider !== IntegrationProvider.META) {
      throw new BadRequestException('AdAccount Meta não encontrada para a store informada');
    }

    if (!adAccount.externalId && !adAccount.metaId) {
      throw new BadRequestException('AdAccount Meta sem identificador externo');
    }

    return adAccount;
  }

  private async getMetaAdAccountForCampaign(
    adAccountId: string,
    storeId: string,
    requester: AuthenticatedUser,
  ): Promise<AdAccount> {
    const adAccount = await this.accessScope.validateAdAccountInStoreAccess(
      requester,
      storeId,
      adAccountId,
    );
    if (adAccount.provider !== IntegrationProvider.META) {
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

  private async validateCampaignCreationPrerequisites(
    storeId: string,
    requester: AuthenticatedUser,
    dto: CreateMetaCampaignDto,
    integration: StoreIntegration,
  ): Promise<ValidatedMetaCampaignContext> {
    const adAccount = await this.getMetaAdAccountForCampaign(dto.adAccountId, storeId, requester);
    const adAccountExternalId = this.normalizeAdAccountExternalId(adAccount.externalId || adAccount.metaId);
    const pageId = this.getMetadataString(integration.metadata, ['pageId', 'metaPageId', 'facebookPageId']);
    if (!pageId) {
      throw new BadRequestException({
        message: 'pageId é obrigatório para criar o criativo',
        step: 'creative',
        hint: 'Configure a página da store na integração Meta antes de criar a campanha.',
      });
    }

    const objective = this.normalizeCreateObjective(dto.objective);
    const destinationUrl = this.resolveDestinationUrl(dto, integration);
    this.assertValidCampaignPayload(dto, objective, destinationUrl);
    await this.assertValidCampaignLocation(dto);

    return {
      adAccount,
      adAccountExternalId,
      pageId,
      destinationUrl,
      objective,
    };
  }

  private resolveDestinationUrl(dto: CreateMetaCampaignDto, integration: StoreIntegration): string {
    const baseUrl = (
      dto.destinationUrl?.trim()
      || this.getMetadataString(integration.metadata, ['destinationUrl', 'websiteUrl', 'objectUrl'])
      || ''
    );

    return this.appendUtmParameters(baseUrl, dto);
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
      existingCampaign.startTime = new Date(dto.startTime);
      existingCampaign.endTime = dto.endTime ? new Date(dto.endTime) : null;
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
        startTime: new Date(dto.startTime),
        endTime: dto.endTime ? new Date(dto.endTime) : null,
        userId: requester.id,
        createdByUserId: requester.id,
        storeId,
        adAccountId: adAccount.id,
        lastSeenAt: now,
      }),
    );
  }

  private buildCampaignCreationPayload(
    storeId: string,
    requesterId: string,
    dto: CreateMetaCampaignDto,
  ): Record<string, unknown> {
    return {
      storeId,
      requesterId,
      name: dto.name.trim(),
      objective: dto.objective.trim().toUpperCase(),
      dailyBudget: Number(dto.dailyBudget),
      startTime: dto.startTime,
      endTime: dto.endTime?.trim() || null,
      country: dto.country.trim().toUpperCase(),
      adAccountId: dto.adAccountId,
      message: dto.message.trim(),
      assetId: dto.assetId?.trim() || null,
      imageUrl: dto.imageUrl?.trim() || null,
      state: dto.state?.trim().toUpperCase() || null,
      stateName: dto.stateName?.trim() || null,
      region: dto.region?.trim() || null,
      city: dto.city?.trim() || null,
      cityId: dto.cityId ? Number(dto.cityId) : null,
      destinationUrl: dto.destinationUrl?.trim() || null,
      headline: dto.headline?.trim() || null,
      description: dto.description?.trim() || null,
      cta: dto.cta ? normalizeMetaCtaType(dto.cta) : null,
      pixelId: dto.pixelId?.trim() || null,
      conversionEvent: dto.conversionEvent?.trim() || null,
      placements: dto.placements?.map((item) => item.trim()).filter(Boolean) || [],
      specialAdCategories: this.normalizeSpecialAdCategories(dto.specialAdCategories),
      utmSource: dto.utmSource?.trim() || null,
      utmMedium: dto.utmMedium?.trim() || null,
      utmCampaign: dto.utmCampaign?.trim() || null,
      utmContent: dto.utmContent?.trim() || null,
      utmTerm: dto.utmTerm?.trim() || null,
      initialStatus: dto.initialStatus || 'PAUSED',
    };
  }

  private normalizeCreateCampaignDto(dto: CreateMetaCampaignDto): CreateMetaCampaignDto {
    const fallbackStartTime = new Date().toISOString();
    return {
      ...dto,
      assetId: dto.assetId?.trim() || undefined,
      imageUrl: dto.imageUrl?.trim() || undefined,
      cta: dto.cta ? normalizeMetaCtaType(dto.cta) : undefined,
      startTime: dto.startTime?.trim() || fallbackStartTime,
      endTime: dto.endTime?.trim() || undefined,
      state: dto.state?.trim().toUpperCase() || undefined,
      stateName: dto.stateName?.trim() || undefined,
      region: dto.region?.trim() || undefined,
      city: dto.city?.trim() || undefined,
      cityId: dto.cityId ? Number(dto.cityId) : undefined,
      pixelId: dto.pixelId?.trim() || undefined,
      conversionEvent: dto.conversionEvent?.trim() || undefined,
      placements: dto.placements?.map((item) => item.trim()).filter(Boolean) || undefined,
      specialAdCategories: this.normalizeSpecialAdCategories(dto.specialAdCategories),
      utmSource: dto.utmSource?.trim() || undefined,
      utmMedium: dto.utmMedium?.trim() || undefined,
      utmCampaign: dto.utmCampaign?.trim() || undefined,
      utmContent: dto.utmContent?.trim() || undefined,
      utmTerm: dto.utmTerm?.trim() || undefined,
    };
  }

  private async resolveAssetBackedCampaignDto(
    storeId: string,
    dto: CreateMetaCampaignDto,
  ): Promise<CreateMetaCampaignDto> {
    if (!dto.assetId) {
      if (!dto.imageUrl?.trim()) {
        throw new BadRequestException('assetId ou imageUrl é obrigatório');
      }
      return dto;
    }

    const asset = await this.assetsService.getAssetForStore(storeId, dto.assetId);
    if (asset.type !== 'image') {
      throw new BadRequestException('O asset selecionado precisa ser uma imagem');
    }

    return {
      ...dto,
      imageUrl: asset.storageUrl,
    };
  }

  private async assertValidCampaignLocation(dto: CreateMetaCampaignDto): Promise<void> {
    const location = normalizeCampaignLocation(dto);

    if (!location.state && !location.city && !location.cityId && !location.stateName && !location.region) {
      return;
    }

    if (location.state && location.cityId) {
      const validLocation = await this.ibgeService.validateCityForState(location.state, location.cityId, location.city || null);
      if (!validLocation) {
        throw new BadRequestException('cityId informado não pertence ao estado selecionado.');
      }
    }
  }

  private hashPayload(payload: Record<string, unknown>): string {
    return createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  private resolveIdempotencyKey(payloadHash: string, dto: CreateMetaCampaignDto): string {
    const normalized = dto.idempotencyKey?.trim();
    if (normalized) {
      return normalized;
    }

    return payloadHash;
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

  private assertSameCampaignCreationPayload(execution: MetaCampaignCreation, payloadHash: string): void {
    if (!execution.payloadHash || execution.payloadHash === payloadHash) {
      return;
    }

    throw new BadRequestException({
      message: 'idempotencyKey reutilizada com payload incompatível.',
      executionId: execution.id,
      executionStatus: this.normalizeCampaignCreationStatus(execution.status),
      idempotencyKey: execution.idempotencyKey,
    });
  }

  private normalizeCampaignCreationStatus(status: MetaCampaignCreationStatus): MetaCampaignCreationStatus {
    if (status === MetaCampaignCreationStatus.CREATING) {
      return MetaCampaignCreationStatus.IN_PROGRESS;
    }

    if (status === MetaCampaignCreationStatus.ACTIVE) {
      return MetaCampaignCreationStatus.COMPLETED;
    }

    return status;
  }

  private isCompletedCampaignCreation(status: MetaCampaignCreationStatus): boolean {
    return this.normalizeCampaignCreationStatus(status) === MetaCampaignCreationStatus.COMPLETED;
  }

  private isInProgressCampaignCreation(status: MetaCampaignCreationStatus): boolean {
    return this.normalizeCampaignCreationStatus(status) === MetaCampaignCreationStatus.IN_PROGRESS;
  }

  private resolveExistingCampaignCreation(execution: MetaCampaignCreation): CreateMetaCampaignResponseDto {
    const executionStatus = this.normalizeCampaignCreationStatus(execution.status);
    const partialIds = this.executionIds(execution);
    const step = this.normalizeExecutionStep(execution.errorStep);
    const hint = this.buildMetaCreationHint(step, undefined, execution.requestPayload || {});
    const currentStep = this.normalizeExecutionStep(execution.currentStep);

    if (this.isCompletedCampaignCreation(execution.status)) {
      if (!execution.metaCampaignId || !execution.metaAdSetId || !execution.metaCreativeId || !execution.metaAdId) {
        throw new ConflictException({
          message: 'Execução idempotente concluída sem todos os IDs externos. Verifique o histórico da campanha.',
          executionId: execution.id,
          executionStatus,
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
        executionStatus: 'COMPLETED',
        initialStatus: execution.requestPayload?.['initialStatus'] === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
        storeId: execution.storeId,
        adAccountId: execution.adAccountId,
        platform: 'META',
        currentStep,
        canRetry: execution.canRetry,
        retryCount: execution.retryCount,
        userMessage: execution.userMessage ?? 'A execução da campanha já foi concluída com sucesso.',
        stepState: execution.stepState ?? undefined,
        hint,
      };
    }

    if (this.isInProgressCampaignCreation(execution.status)) {
      throw new ConflictException({
        message: 'Criação de campanha já está em andamento para esta idempotencyKey.',
        executionId: execution.id,
        executionStatus,
        idempotencyKey: execution.idempotencyKey,
        step,
        partialIds,
        currentStep,
        canRetry: false,
        retryCount: execution.retryCount,
        userMessage: execution.userMessage ?? 'Já existe uma execução em andamento para esta campanha.',
        hint: 'Aguarde a finalização desta execução ou consulte o status da execução existente antes de reenviar a campanha.',
      });
    }

    throw new BadRequestException({
      message: 'Já existe uma execução parcial para esta idempotencyKey. Use o endpoint de recovery para continuar sem duplicar recursos na Meta.',
      executionId: execution.id,
      executionStatus,
      idempotencyKey: execution.idempotencyKey,
      step,
      partialIds,
      currentStep,
      canRetry: execution.canRetry,
      retryCount: execution.retryCount,
      userMessage: execution.userMessage ?? 'Parte da campanha já foi criada. Retome a execução existente para evitar duplicação.',
      stepState: execution.stepState ?? undefined,
      errorMessage: execution.errorMessage,
      hint,
    });
  }

  private async createCampaignCreationExecution(
    storeId: string,
    requester: AuthenticatedUser,
    adAccount: AdAccount,
    requestPayload: Record<string, unknown>,
    payloadHash: string,
    idempotencyKey: string,
  ): Promise<MetaCampaignCreation> {
    try {
      return await this.campaignCreationRepository.save(
        this.campaignCreationRepository.create({
          storeId,
          requesterUserId: requester.id,
          adAccountId: adAccount.id,
          idempotencyKey,
          status: MetaCampaignCreationStatus.IN_PROGRESS,
          currentStep: 'campaign',
          stepState: this.buildInitialExecutionStepState(),
          retryCount: 0,
          lastRetryAt: null,
          canRetry: false,
          userMessage: null,
          requestPayload,
          payloadHash,
        }),
      );
    } catch (err) {
      if (idempotencyKey && this.isUniqueConstraintError(err)) {
        const existing = await this.findCampaignCreationByIdempotencyKey(storeId, idempotencyKey);
        if (existing) {
          this.assertSameCampaignCreationPayload(existing, payloadHash);
          throw new ConflictException({
            message: 'Criação de campanha já registrada para esta idempotencyKey. Repita a requisição para obter o resultado atual.',
            executionId: existing.id,
            executionStatus: this.normalizeCampaignCreationStatus(existing.status),
            idempotencyKey,
            currentStep: this.normalizeExecutionStep(existing.currentStep),
            canRetry: existing.canRetry,
            retryCount: existing.retryCount,
            userMessage: existing.userMessage ?? null,
            stepState: existing.stepState ?? undefined,
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
    execution.currentStep = this.nextExecutionStep(step);
    execution.canRetry = false;
    execution.userMessage = null;
    execution.stepState = this.completeExecutionStep(execution.stepState, step, ids);

    const nextStep = this.normalizeExecutionStep(execution.currentStep);
    if (nextStep) {
      execution.stepState = this.markExecutionStepInProgress(execution.stepState, nextStep);
    }

    await this.campaignCreationRepository.save(execution);
  }

  private async finishCampaignCreationExecution(
    execution: MetaCampaignCreation,
    campaignId: string,
    ids: Partial<Record<'campaignId' | 'adSetId' | 'creativeId' | 'adId', string>>,
  ): Promise<void> {
    execution.status = MetaCampaignCreationStatus.COMPLETED;
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
    execution.currentStep = null;
    execution.canRetry = false;
    execution.userMessage = null;
    execution.stepState = this.completeExecutionStep(
      this.completeExecutionStep(execution.stepState, 'persist', ids),
      'ad',
      ids,
    );
    await this.campaignCreationRepository.save(execution);
  }

  private async failCampaignCreationExecution(
    execution: MetaCampaignCreation,
    step: MetaCampaignCreationStep,
    message: string,
    ids: Partial<Record<'campaignId' | 'adSetId' | 'creativeId' | 'adId', string>>,
    options: {
      hint?: string;
      userMessage?: string;
    } = {},
  ): Promise<void> {
    const hasPartialMetaResources = this.hasRecoverablePartialIds(ids);
    execution.status = hasPartialMetaResources
      ? MetaCampaignCreationStatus.PARTIAL
      : MetaCampaignCreationStatus.FAILED;
    execution.errorStep = step;
    execution.errorMessage = message;
    execution.currentStep = step;
    execution.metaCampaignId = ids.campaignId ?? execution.metaCampaignId;
    execution.metaAdSetId = ids.adSetId ?? execution.metaAdSetId;
    execution.metaCreativeId = ids.creativeId ?? execution.metaCreativeId;
    execution.metaAdId = ids.adId ?? execution.metaAdId;
    execution.campaignCreated = Boolean(execution.metaCampaignId);
    execution.adSetCreated = Boolean(execution.metaAdSetId);
    execution.creativeCreated = Boolean(execution.metaCreativeId);
    execution.adCreated = Boolean(execution.metaAdId);
    execution.canRetry = hasPartialMetaResources;
    execution.userMessage = options.userMessage
      ?? this.buildExecutionUserMessage(step, execution.status, options.hint);
    execution.stepState = this.failExecutionStep(execution.stepState, step, message, ids);
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

  private normalizeExecutionStep(step: string | null | undefined): MetaCampaignCreationStep | undefined {
    if (step === 'campaign' || step === 'adset' || step === 'creative' || step === 'ad' || step === 'persist') {
      return step;
    }

    return undefined;
  }

  private describeCampaignCreationStep(step: MetaCampaignCreationStep): string {
    if (step === 'campaign') return 'criação da campanha';
    if (step === 'adset') return 'criação do conjunto de anúncios';
    if (step === 'creative') return 'criação do criativo';
    if (step === 'ad') return 'criação do anúncio';
    return 'persistência local da campanha';
  }

  private buildMetaCreationHint(
    step: MetaCampaignCreationStep | undefined,
    metaError?: {
      message: string;
      code: number | null;
      subcode: number | null;
      userTitle: string | null;
      userMessage: string | null;
    },
    payload?: Record<string, unknown>,
  ): string {
    const destinationUrl = typeof payload?.['destinationUrl'] === 'string' ? payload.destinationUrl : null;
    const pageId = typeof payload?.['pageId'] === 'string' ? payload.pageId : null;

    if (!step) {
      return 'Revise a configuração da store e os campos obrigatórios antes de tentar novamente.';
    }

    if (step === 'creative') {
      if (!pageId) {
        return 'Verifique se o pageId está configurado na integração da store.';
      }
      if (!isValidMetaHttpsUrl(destinationUrl)) {
        return 'Verifique se o destination_url está preenchido com uma URL https válida.';
      }
      if (metaError?.userMessage) {
        return this.sanitizeError(metaError.userMessage);
      }
      return 'Verifique pageId, destination_url https, texto do anúncio e imagem usada no criativo.';
    }

    if (step === 'adset') {
      if ((metaError?.message || '').toLowerCase().includes('type integer is expected')
        || (metaError?.userMessage || '').toLowerCase().includes('type integer is expected')
        || metaError?.subcode === 1885097) {
        return 'O conjunto de anúncios falhou porque um campo obrigatório foi enviado vazio. Verifique orçamento, pixel ou localização.';
      }
      return 'Verifique daily_budget, pixel, evento de conversão, país, placements e segmentação mínima antes de repetir a criação do conjunto.';
    }

    if (step === 'campaign') {
      return 'Verifique objective, nome da campanha e permissões da conta de anúncios.';
    }

    if (step === 'ad') {
      return 'Verifique se o adset e o creative já foram criados corretamente antes de publicar o anúncio.';
    }

    return 'A Meta criou os recursos, mas houve falha ao persistir localmente. Revise o banco e reconcilie a execução usando o executionId.';
  }

  private buildMetaValidationPayloadLog(
    dto: CreateMetaCampaignDto,
    validation?: Partial<ValidatedMetaCampaignContext>,
  ): Record<string, unknown> {
    return {
      name: dto.name?.trim() || null,
      objective: dto.objective?.trim().toUpperCase() || null,
      dailyBudget: Number(dto.dailyBudget),
      country: dto.country?.trim().toUpperCase() || null,
      adAccountId: dto.adAccountId,
      adAccountExternalId: validation?.adAccountExternalId ?? null,
      pageId: validation?.pageId ?? null,
      destinationUrl: validation?.destinationUrl ?? dto.destinationUrl?.trim() ?? null,
      hasMessage: Boolean(dto.message?.trim()),
      headline: dto.headline?.trim() || null,
      description: dto.description?.trim() || null,
      cta: dto.cta ? normalizeMetaCtaType(dto.cta) : null,
      pixelId: dto.pixelId?.trim() || null,
      conversionEvent: dto.conversionEvent?.trim() || null,
      placements: dto.placements?.map((item) => item.trim()).filter(Boolean) || [],
      specialAdCategories: this.normalizeSpecialAdCategories(dto.specialAdCategories) || [],
      utmSource: dto.utmSource?.trim() || null,
      utmMedium: dto.utmMedium?.trim() || null,
      utmCampaign: dto.utmCampaign?.trim() || null,
      utmContent: dto.utmContent?.trim() || null,
      utmTerm: dto.utmTerm?.trim() || null,
      initialStatus: dto.initialStatus || 'PAUSED',
      targeting: {
        country: dto.country?.trim().toUpperCase() || null,
        state: dto.state?.trim().toUpperCase() || null,
        stateName: dto.stateName?.trim() || null,
        region: dto.region?.trim() || null,
        city: dto.city?.trim() || null,
        cityId: dto.cityId ? Number(dto.cityId) : null,
      },
      assetId: dto.assetId?.trim() || null,
      imageUrl: dto.imageUrl?.trim() || null,
    };
  }

  private sanitizeForLog<T>(value: T): T {
    if (!value || typeof value !== 'object') {
      return value;
    }

    try {
      return JSON.parse(
        JSON.stringify(value, (key, currentValue) => {
          const normalizedKey = key.toLowerCase();
          if (normalizedKey.includes('access_token') || normalizedKey.includes('client_secret')) {
            return '[redacted]';
          }

          if (typeof currentValue === 'string') {
            return this.sanitizeError(currentValue);
          }

          return currentValue;
        }),
      ) as T;
    } catch {
      return '[unserializable]' as T;
    }
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
    createdIds: MetaCampaignCreationIds,
    execution: MetaCampaignCreation,
    requesterId: string,
    idempotencyKey: string,
    requestId?: string,
    startedAt?: number,
    dto?: CreateMetaCampaignDto,
    validation?: Partial<ValidatedMetaCampaignContext>,
  ): Promise<never> {
    const metaError = this.extractMetaErrorDetails(err);
    const status = (err as any)?.response?.status;
    const message = metaError.summary;
    const payloadForHint = dto
      ? this.buildMetaValidationPayloadLog(dto, validation)
      : this.sanitizeForLog(execution.requestPayload || {});
    const hint = this.buildMetaCreationHint(step, metaError, {
      ...(payloadForHint as Record<string, unknown>),
      destinationUrl: validation?.destinationUrl
        ?? (typeof execution.requestPayload?.['destinationUrl'] === 'string' ? execution.requestPayload.destinationUrl : null),
      pageId: validation?.pageId
        ?? (typeof execution.requestPayload?.['pageId'] === 'string' ? execution.requestPayload.pageId : null),
    });
    const userMessage = this.buildMetaUserMessage(step, metaError, hint);
    await this.failCampaignCreationExecution(execution, step, message, createdIds, { hint, userMessage });
    const executionStatus = this.normalizeCampaignCreationStatus(execution.status);
    const sanitizedMetaResponse = this.sanitizeForLog((err as any)?.response?.data);

    this.logger.warn(
      JSON.stringify({
        event: 'META_CAMPAIGN_CREATION_FAILED',
        requestId,
        storeId,
        requesterId,
        idempotencyKey,
        executionId: execution.id,
        step,
        status: executionStatus,
        metaCode: metaError.code,
        metaSubcode: metaError.subcode,
        fbtraceId: metaError.fbtraceId,
        metaType: metaError.type,
        metaUserTitle: metaError.userTitle,
        metaUserMessage: metaError.userMessage,
        partialIds: createdIds,
        payload: payloadForHint,
        metaResponse: sanitizedMetaResponse,
        error: message,
        hint,
        duration: startedAt ? Date.now() - startedAt : undefined,
      }),
    );

    if (status === 401 || metaError.code === 190 || message === 'TOKEN_INVALID') {
      await this.markIntegrationError(storeId, 'TOKEN_INVALID');
      throw new HttpException({
        message: 'Token Meta inválido ou expirado. Reconecte a store.',
        executionId: execution.id,
        executionStatus,
        step,
        currentStep: this.normalizeExecutionStep(execution.currentStep),
        partialIds: createdIds,
        canRetry: execution.canRetry,
        retryCount: execution.retryCount,
        userMessage: execution.userMessage,
        stepState: execution.stepState ?? undefined,
        hint: 'Reconecte a store na Meta e repita a operação depois de validar as permissões ads_management.',
      }, HttpStatus.UNAUTHORIZED);
    }

    await this.recordCampaignCreationFailure(storeId, step, message, createdIds);

    if (status === 429 || metaError.code === 4) {
      throw new HttpException({
        message: 'A Meta limitou temporariamente as requisições. Tente novamente em alguns minutos.',
        executionId: execution.id,
        executionStatus,
        step,
        currentStep: this.normalizeExecutionStep(execution.currentStep),
        partialIds: createdIds,
        canRetry: execution.canRetry,
        retryCount: execution.retryCount,
        userMessage: execution.userMessage,
        stepState: execution.stepState ?? undefined,
        hint: 'Aguarde o rate limit da Meta liberar antes de repetir a criação.',
      }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const isMetaValidationError = status === 400 || metaError.code === 100;
    const stepLabel = this.describeCampaignCreationStep(step);
    const response = {
      message: `Erro na ${stepLabel}: ${message}`,
      executionId: execution.id,
      executionStatus,
      step,
      currentStep: this.normalizeExecutionStep(execution.currentStep),
      partialIds: createdIds,
      canRetry: execution.canRetry,
      retryCount: execution.retryCount,
      userMessage: execution.userMessage,
      stepState: execution.stepState ?? undefined,
      metaError,
      hint,
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

  private normalizeSpecialAdCategories(values?: string[]): string[] | undefined {
    const normalized = (values || [])
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)
      .filter((item) => item !== 'NONE' && item !== 'NENHUMA');

    if (!normalized.length) {
      return undefined;
    }

    return Array.from(new Set(normalized));
  }

  private appendUtmParameters(urlValue: string, dto: Pick<CreateMetaCampaignDto, 'utmSource' | 'utmMedium' | 'utmCampaign' | 'utmContent' | 'utmTerm'>): string {
    if (!urlValue?.trim()) {
      return '';
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlValue.trim());
    } catch {
      return urlValue.trim();
    }

    const utmMap: Array<[string, string | undefined]> = [
      ['utm_source', dto.utmSource?.trim()],
      ['utm_medium', dto.utmMedium?.trim()],
      ['utm_campaign', dto.utmCampaign?.trim()],
      ['utm_content', dto.utmContent?.trim()],
      ['utm_term', dto.utmTerm?.trim()],
    ];

    for (const [key, value] of utmMap) {
      if (value) {
        parsedUrl.searchParams.set(key, value);
      }
    }

    return parsedUrl.toString();
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

  private extractMetaErrorDetails(err: unknown): {
    message: string;
    summary: string;
    code: number | null;
    subcode: number | null;
    type: string | null;
    userTitle: string | null;
    userMessage: string | null;
    fbtraceId: string | null;
  } {
    const meta = (err as any)?.response?.data?.error;
    const message = this.sanitizeError(meta?.message || (err as Error)?.message || 'Erro ao criar campanha na Meta');
    const details = [
      meta?.error_subcode ? `subcode=${meta.error_subcode}` : null,
      meta?.error_user_title ? `userTitle=${this.sanitizeError(meta.error_user_title)}` : null,
      meta?.error_user_msg ? `userMessage=${this.sanitizeError(meta.error_user_msg)}` : null,
      meta?.type ? `type=${this.sanitizeError(meta.type)}` : null,
      meta?.fbtrace_id ? `fbtraceId=${this.sanitizeError(meta.fbtrace_id)}` : null,
      meta?.code ? `code=${meta.code}` : null,
    ].filter(Boolean);

    return {
      message,
      summary: details.length ? `${message} | ${details.join(' | ')}` : message,
      code: meta?.code ?? null,
      subcode: meta?.error_subcode ?? null,
      type: meta?.type ?? null,
      userTitle: meta?.error_user_title ?? null,
      userMessage: meta?.error_user_msg ?? null,
      fbtraceId: meta?.fbtrace_id ?? null,
    };
  }

  private buildInitialExecutionStepState(): MetaCampaignExecutionStepStateMap {
    const base = Object.fromEntries(
      META_CAMPAIGN_EXECUTION_STEPS.map((step) => [step, { status: 'PENDING' as const }]),
    ) as MetaCampaignExecutionStepStateMap;

    return this.markExecutionStepInProgress(base, 'campaign');
  }

  private markExecutionStepInProgress(
    stepState: MetaCampaignExecutionStepStateMap | null | undefined,
    step: MetaCampaignCreationStep,
  ): MetaCampaignExecutionStepStateMap {
    const next = this.cloneExecutionStepState(stepState);
    next[step] = {
      ...next[step],
      status: 'IN_PROGRESS',
      startedAt: next[step].startedAt ?? new Date().toISOString(),
      failedAt: null,
      errorMessage: null,
    };
    return next;
  }

  private completeExecutionStep(
    stepState: MetaCampaignExecutionStepStateMap | null | undefined,
    step: MetaCampaignCreationStep,
    ids: MetaCampaignExecutionIds,
  ): MetaCampaignExecutionStepStateMap {
    const next = this.cloneExecutionStepState(stepState);
    next[step] = {
      ...next[step],
      status: 'COMPLETED',
      startedAt: next[step].startedAt ?? new Date().toISOString(),
      completedAt: new Date().toISOString(),
      failedAt: null,
      errorMessage: null,
      ids: this.mergeExecutionIds(next[step].ids, ids),
    };
    return next;
  }

  private failExecutionStep(
    stepState: MetaCampaignExecutionStepStateMap | null | undefined,
    step: MetaCampaignCreationStep,
    message: string,
    ids: MetaCampaignExecutionIds,
  ): MetaCampaignExecutionStepStateMap {
    const next = this.cloneExecutionStepState(stepState);
    next[step] = {
      ...next[step],
      status: 'FAILED',
      startedAt: next[step].startedAt ?? new Date().toISOString(),
      failedAt: new Date().toISOString(),
      errorMessage: this.sanitizeError(message),
      ids: this.mergeExecutionIds(next[step].ids, ids),
    };
    return next;
  }

  private cloneExecutionStepState(
    stepState: MetaCampaignExecutionStepStateMap | null | undefined,
  ): MetaCampaignExecutionStepStateMap {
    if (stepState) {
      return JSON.parse(JSON.stringify(stepState)) as MetaCampaignExecutionStepStateMap;
    }

    return Object.fromEntries(
      META_CAMPAIGN_EXECUTION_STEPS.map((step) => [step, { status: 'PENDING' as const }]),
    ) as MetaCampaignExecutionStepStateMap;
  }

  private mergeExecutionIds(
    current: MetaCampaignExecutionIds | undefined,
    incoming: MetaCampaignExecutionIds,
  ): MetaCampaignExecutionIds | undefined {
    const merged = {
      ...(current ?? {}),
      ...(incoming ?? {}),
    };

    return Object.keys(merged).length ? merged : undefined;
  }

  private nextExecutionStep(step: MetaCampaignCreationStep): MetaCampaignCreationStep | null {
    const currentIndex = META_CAMPAIGN_EXECUTION_STEPS.indexOf(step);
    return currentIndex >= 0 ? (META_CAMPAIGN_EXECUTION_STEPS[currentIndex + 1] ?? null) : null;
  }

  private hasRecoverablePartialIds(ids: MetaCampaignExecutionIds): boolean {
    return Boolean(ids.campaignId || ids.adSetId || ids.creativeId || ids.adId);
  }

  private buildExecutionUserMessage(
    step: MetaCampaignCreationStep,
    status: MetaCampaignCreationStatus,
    hint?: string,
  ): string {
    if (status === MetaCampaignCreationStatus.PARTIAL) {
      return `Parte da campanha foi criada na Meta e a execução parou em ${this.describeCampaignCreationStep(step)}. ${hint ?? 'Use o recovery seguro para continuar sem duplicar recursos.'}`;
    }

    if (step === 'persist') {
      return 'A Meta criou recursos externos, mas houve falha ao salvar a campanha localmente. Revise a execução antes de tentar novamente.';
    }

    return `A execução falhou em ${this.describeCampaignCreationStep(step)}. Revise os dados e tente novamente.`;
  }

  private buildMetaUserMessage(
    step: MetaCampaignCreationStep,
    metaError: {
      userTitle: string | null;
      userMessage: string | null;
    },
    hint: string,
  ): string {
    const directMessage = metaError.userMessage || metaError.userTitle;
    if (directMessage) {
      return this.sanitizeError(directMessage);
    }

    if (step === 'persist') {
      return 'A Meta respondeu com sucesso, mas o sistema não conseguiu concluir a persistência local. Use o executionId para retomar ou reconciliar a campanha.';
    }

    if (step === 'adset') {
      return 'O conjunto de anúncios falhou porque um campo obrigatório foi enviado vazio. Verifique orçamento, pixel ou localização.';
    }

    return hint;
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
