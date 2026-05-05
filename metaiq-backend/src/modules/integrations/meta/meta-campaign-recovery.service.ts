import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MetaCampaignCreation,
  MetaCampaignCreationStatus,
  MetaCampaignCreationStep,
  MetaCampaignStoredMetaError,
} from './meta-campaign-creation.entity';
import { MetaCampaignOrchestrator } from './meta-campaign.orchestrator';
import { MetaGraphApiClient } from './meta-graph-api.client';
import { CreateMetaCampaignDto, RetryPartialCampaignDto } from './dto/meta-integration.dto';
import { normalizeMetaCtaType } from './meta-cta.constants';
import { isLikelyDirectImageUrl, isValidMetaHttpUrl, isValidMetaHttpsUrl } from './meta-creative.validation';
import { AuthenticatedUser } from '../../../common/interfaces';
import { AccessScopeService } from '../../../common/services/access-scope.service';
import { IntegrationProvider, IntegrationStatus, Role } from '../../../common/enums';
import { AssetsService } from '../../assets/assets.service';
import { StoreIntegration } from '../store-integration.entity';
import { AdAccount } from '../../ad-accounts/ad-account.entity';
import { Campaign } from '../../campaigns/campaign.entity';

/**
 * Serviço de recuperação para campanhas criadas parcialmente na Meta
 *
 * Quando uma criação de campanha falha no meio do processo (ex: adset, creative, ad),
 * este serviço ajuda a recuperar de duas maneiras:
 *
 * 1. RETRY: Tenta continuar de onde parou (continuar completando os steps)
 * 2. CLEANUP: Remove recursos criados parcialmente da Meta
 */
@Injectable()
export class MetaCampaignRecoveryService {
  private readonly logger = new Logger(MetaCampaignRecoveryService.name);

  constructor(
    @InjectRepository(MetaCampaignCreation)
    private readonly campaignCreationRepository: Repository<MetaCampaignCreation>,
    @InjectRepository(StoreIntegration)
    private readonly integrationRepository: Repository<StoreIntegration>,
    @InjectRepository(AdAccount)
    private readonly adAccountRepository: Repository<AdAccount>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    private readonly campaignOrchestrator: MetaCampaignOrchestrator,
    private readonly graphApi: MetaGraphApiClient,
    private readonly accessScope: AccessScopeService,
    private readonly assetsService: AssetsService,
  ) {}

  /**
   * ✅ RETRY: Continua uma criação de campanha que parou no meio
   * 
   * Exemplo:
   * - Campaign criado ✅ (ID: 123)
   * - AdSet falhou ❌
   * - Chama retry() → tenta criar AdSet, Creative, Ad a partir de onde parou
   */
  async retryPartialCampaignCreationForUser(
    user: AuthenticatedUser,
    storeId: string,
    executionId: string,
    dto: RetryPartialCampaignDto,
  ): Promise<{ success: boolean; message: string; ids?: Record<string, string> }> {
    await this.validateCanManage(storeId, user);
    const execution = await this.getScopedExecution(executionId, storeId, user);

    if (this.isCompletedExecution(execution.status)) {
      return {
        success: true,
        message: 'Campanha já foi completada com sucesso',
        ids: {
          campaignId: execution.metaCampaignId!,
          adSetId: execution.metaAdSetId!,
          creativeId: execution.metaCreativeId!,
          adId: execution.metaAdId!,
        },
      };
    }

    if (this.isInProgressExecution(execution.status)) {
      throw new HttpException(
        {
          message: 'Execução ainda está em andamento. Aguarde alguns minutos.',
          executionId,
        },
        HttpStatus.CONFLICT,
      );
    }

    if (execution.status === MetaCampaignCreationStatus.FAILED && !execution.canRetry) {
      throw new BadRequestException({
        message: 'Esta campanha falhou completamente. Inicie uma nova criação.',
        executionId,
        errorStep: execution.errorStep,
        errorMessage: execution.errorMessage,
      });
    }

    // Status = PARTIAL - vamos tentar recuperar
    const context = await this.getRecoveryContext(execution, dto);
    this.logRecovery('recovery_started', {
      executionId: execution.id,
      storeId: execution.storeId,
      userId: user.id,
      tenantId: user.tenantId,
      idempotencyKey: execution.idempotencyKey,
      step: execution.errorStep,
      previousStep: this.previousStep(execution.errorStep),
      partialIds: this.executionPartialIds(execution),
      payload: this.buildRecoveryPayloadLog(context.dto, context.pageId, context.destinationUrl),
    });
    return this.resumeFromPartialFailure(execution, context.accessToken, context.adAccountExternalId, context.dto, context.pageId, context.destinationUrl, context.objective);
  }

  /**
   * ❌ CLEANUP: Remove recursos que foram criados parcialmente na Meta
   * 
   * Útil quando:
   * - Usuário quer desistir da campanha
   * - Quer tentar novamente com configuração diferente
   * - Recursos parciais devem ser removidos antes de tentar de novo
   */
  async cleanupPartialResourcesForUser(
    user: AuthenticatedUser,
    storeId: string,
    executionId: string,
  ): Promise<{ success: boolean; message: string; cleaned: Record<string, boolean> }> {
    await this.validateCanManage(storeId, user);
    const execution = await this.getScopedExecution(executionId, storeId, user);

    if (execution.status !== MetaCampaignCreationStatus.PARTIAL && execution.status !== MetaCampaignCreationStatus.FAILED) {
      throw new BadRequestException({
        message: 'Somente execuções PARTIAL ou FAILED podem ser limpas',
        currentStatus: execution.status,
      });
    }

    const cleaned: Record<string, boolean> = {
      ad: false,
      creative: false,
      adset: false,
      campaign: false,
    };

    const context = await this.getCleanupContext(execution);
    const accessToken = context.accessToken;
    this.logRecovery('rollback_started', {
      executionId: execution.id,
      storeId: execution.storeId,
      idempotencyKey: execution.idempotencyKey,
      step: execution.errorStep,
      previousStep: this.previousStep(execution.errorStep),
      partialIds: this.executionPartialIds(execution),
    });

    try {
      // Remover em ordem inversa de dependência
      if (execution.metaAdId) {
        try {
          await this.deleteMetaResource(execution.metaAdId, accessToken);
          cleaned.ad = true;
          this.logger.log(`Removido Ad ${execution.metaAdId}`);
        } catch (e) {
          this.logger.warn(`Falha ao remover Ad ${execution.metaAdId}: ${(e as Error).message}`);
        }
      }

      if (execution.metaCreativeId) {
        try {
          await this.deleteMetaResource(execution.metaCreativeId, accessToken);
          cleaned.creative = true;
          this.logger.log(`Removido Creative ${execution.metaCreativeId}`);
        } catch (e) {
          this.logger.warn(`Falha ao remover Creative ${execution.metaCreativeId}: ${(e as Error).message}`);
        }
      }

      if (execution.metaAdSetId) {
        try {
          await this.deleteMetaResource(execution.metaAdSetId, accessToken);
          cleaned.adset = true;
          this.logger.log(`Removido AdSet ${execution.metaAdSetId}`);
        } catch (e) {
          this.logger.warn(`Falha ao remover AdSet ${execution.metaAdSetId}: ${(e as Error).message}`);
        }
      }

      if (execution.metaCampaignId) {
        try {
          await this.deleteMetaResource(execution.metaCampaignId, accessToken);
          cleaned.campaign = true;
          this.logger.log(`Removido Campaign ${execution.metaCampaignId}`);
        } catch (e) {
          this.logger.warn(`Falha ao remover Campaign ${execution.metaCampaignId}: ${(e as Error).message}`);
        }
      }

      // Marcar execução como deletada
      execution.status = MetaCampaignCreationStatus.FAILED;
      execution.errorMessage = 'Cleanup: recursos removidos';
      execution.metaErrorDetails = null;
      await this.campaignCreationRepository.save(execution);
      this.logRecovery('rollback_completed', {
        executionId: execution.id,
        storeId: execution.storeId,
        idempotencyKey: execution.idempotencyKey,
        step: execution.errorStep,
        previousStep: this.previousStep(execution.errorStep),
        partialIds: this.executionPartialIds(execution),
        cleaned,
      });

      return {
        success: true,
        message: 'Limpeza concluída',
        cleaned,
      };
    } catch (error) {
      throw new HttpException(
        {
          message: 'Erro ao limpar recursos',
          executionId,
          cleaned,
          error: (error as Error).message,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Retorna informações sobre uma execução de criação de campanha
   */
  async getExecutionStatusForUser(user: AuthenticatedUser, storeId: string, executionId: string) {
    await this.validateCanManage(storeId, user);
    const execution = await this.getScopedExecution(executionId, storeId, user, {
      relations: ['store', 'adAccount', 'campaign'],
    });

    return {
      id: execution.id,
      status: this.normalizeExecutionStatus(execution.status),
      idempotencyKey: execution.idempotencyKey,
      step: execution.errorStep,
      currentStep: execution.currentStep,
      canRetry: execution.canRetry,
      retryCount: execution.retryCount,
      userMessage: execution.userMessage,
      stepState: execution.stepState ?? undefined,
      message: execution.errorMessage,
      metaError: execution.metaErrorDetails ?? undefined,
      partialIds: {
        campaign: execution.metaCampaignId || null,
        adset: execution.metaAdSetId || null,
        creative: execution.metaCreativeId || null,
        ad: execution.metaAdId || null,
      },
      store: {
        id: execution.store?.id,
        name: execution.store?.name,
      },
      adAccount: {
        id: execution.adAccount?.id,
        metaId: execution.adAccount?.metaId,
      },
      localCampaign: execution.campaign ? { id: execution.campaign.id, name: execution.campaign.name } : null,
      createdAt: execution.createdAt,
      updatedAt: execution.updatedAt,
    };
  }

  // ─────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────

  private normalizeExecutionStatus(status: MetaCampaignCreationStatus): MetaCampaignCreationStatus {
    if (status === MetaCampaignCreationStatus.CREATING) {
      return MetaCampaignCreationStatus.IN_PROGRESS;
    }

    if (status === MetaCampaignCreationStatus.ACTIVE) {
      return MetaCampaignCreationStatus.COMPLETED;
    }

    return status;
  }

  private isCompletedExecution(status: MetaCampaignCreationStatus): boolean {
    return this.normalizeExecutionStatus(status) === MetaCampaignCreationStatus.COMPLETED;
  }

  private isInProgressExecution(status: MetaCampaignCreationStatus): boolean {
    return this.normalizeExecutionStatus(status) === MetaCampaignCreationStatus.IN_PROGRESS;
  }

  private async resumeFromPartialFailure(
    execution: MetaCampaignCreation,
    accessToken: string,
    adAccountExternalId: string,
    dto: CreateMetaCampaignDto,
    pageId: string,
    destinationUrl: string,
    objective: string,
  ) {
    this.logger.log(`Retomando execução parcial ${execution.id} a partir do step ${execution.errorStep}`);

    const initialIds: Record<string, string | undefined> = {
      campaignId: execution.metaCampaignId || undefined,
      adSetId: execution.metaAdSetId || undefined,
      creativeId: execution.metaCreativeId || undefined,
      adId: execution.metaAdId || undefined,
    };
    const createdIds: Record<string, string | undefined> = { ...initialIds };

    execution.status = MetaCampaignCreationStatus.IN_PROGRESS;
    execution.errorStep = null;
    execution.errorMessage = null;
    execution.currentStep = execution.currentStep || execution.errorStep || this.resolveFailedStep(createdIds);
    execution.canRetry = false;
    execution.retryCount = (execution.retryCount ?? 0) + 1;
    execution.lastRetryAt = new Date();
    execution.userMessage = null;
    execution.metaErrorDetails = null;
    await this.campaignCreationRepository.save(execution);

    try {
      // Continuar o orchestrator de onde parou
      const resumedIds = await this.campaignOrchestrator.resumeCreation({
        adAccountExternalId,
        accessToken,
        dto,
        pageId,
        destinationUrl,
        objective,
        startingIds: { ...initialIds } as any,
        executionId: execution.id,
        storeId: execution.storeId,
        onStepCreated: async (step, ids) => {
          Object.assign(createdIds, ids);
          this.applyCreatedIdsToExecution(execution, createdIds);
          await this.campaignCreationRepository.save(execution);
          this.logger.log(`Step ${step} completado ao resumir`);
        },
      });

      Object.assign(createdIds, resumedIds);

      execution.status = MetaCampaignCreationStatus.COMPLETED;
      this.applyCreatedIdsToExecution(execution, createdIds);
      const localCampaign = await this.recordRecoveredCampaign(execution, dto);
      execution.campaignId = localCampaign.id;
      execution.currentStep = null;
      execution.canRetry = false;
      execution.userMessage = null;
      execution.metaErrorDetails = null;
      await this.campaignCreationRepository.save(execution);
      this.logRecovery('recovery_completed', {
        executionId: execution.id,
        storeId: execution.storeId,
        idempotencyKey: execution.idempotencyKey,
        step: execution.errorStep,
        previousStep: this.previousStep(execution.errorStep),
        partialIds: createdIds,
        localCampaignId: localCampaign.id,
      });

      return {
        success: true,
        message: 'Campanha retomada e concluída com sucesso',
        ids: createdIds,
      };
    } catch (error) {
      const failedStep = this.normalizeRecoveryStep(this.resolveFailedStep(createdIds));
      const metaError = this.toStoredMetaError(failedStep, error);
      const hint = this.buildRecoveryHint(failedStep, dto, pageId, destinationUrl, metaError);
      execution.status = MetaCampaignCreationStatus.PARTIAL;
      execution.errorStep = failedStep;
      execution.errorMessage = this.sanitizeError((error as Error).message);
      execution.currentStep = execution.errorStep;
      execution.canRetry = Boolean(createdIds.campaignId || createdIds.adSetId || createdIds.creativeId || createdIds.adId);
      execution.userMessage = hint;
      execution.metaErrorDetails = metaError;
      this.applyCreatedIdsToExecution(execution, createdIds);
      await this.campaignCreationRepository.save(execution);
      this.logRecovery('meta_execution_failed', {
        executionId: execution.id,
        storeId: execution.storeId,
        idempotencyKey: execution.idempotencyKey,
        step: execution.errorStep,
        previousStep: this.previousStep(execution.errorStep),
        partialIds: createdIds,
        metaCode: metaError?.code ?? null,
        metaSubcode: metaError?.subcode ?? null,
        metaUserTitle: metaError?.userTitle ?? null,
        metaUserMessage: metaError?.userMessage ?? null,
        fbtraceId: metaError?.fbtraceId ?? null,
        metaResponse: this.sanitizeForLog((error as any)?.response?.data),
        error: execution.errorMessage,
        hint,
      });

      throw new HttpException(
        {
          message: `Erro ao retomar ${this.describeStep(execution.errorStep)}: ${execution.errorMessage}`,
          executionId: execution.id,
          executionStatus: execution.status,
          step: execution.errorStep,
          partialIds: createdIds,
          error: execution.errorMessage,
          hint,
          metaError: metaError ?? undefined,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private resolveFailedStep(ids: Record<string, string | undefined>): string {
    if (!ids.campaignId) return 'campaign';
    if (!ids.adSetId) return 'adset';
    if (!ids.creativeId) return 'creative';
    if (!ids.adId) return 'ad';
    return 'unknown';
  }

  private async deleteMetaResource(path: string, accessToken: string): Promise<void> {
    try {
      await this.graphApi.delete<{ success: boolean }>(path, accessToken);
    } catch (error) {
      this.logger.error(`Erro ao deletar ${path}: ${(error as Error).message}`);
      throw error;
    }
  }

  private applyCreatedIdsToExecution(
    execution: MetaCampaignCreation,
    ids: Record<string, string | undefined>,
  ): void {
    execution.metaCampaignId = ids.campaignId ?? execution.metaCampaignId;
    execution.metaAdSetId = ids.adSetId ?? execution.metaAdSetId;
    execution.metaCreativeId = ids.creativeId ?? execution.metaCreativeId;
    execution.metaAdId = ids.adId ?? execution.metaAdId;
    execution.campaignCreated = Boolean(execution.metaCampaignId);
    execution.adSetCreated = Boolean(execution.metaAdSetId);
    execution.creativeCreated = Boolean(execution.metaCreativeId);
    execution.adCreated = Boolean(execution.metaAdId);
  }

  private async getScopedExecution(
    executionId: string,
    storeId: string,
    user: AuthenticatedUser,
    options: { relations?: string[] } = {},
  ): Promise<MetaCampaignCreation> {
    await this.accessScope.validateStoreAccess(user, storeId);
    const execution = await this.campaignCreationRepository.findOne({
      where: { id: executionId, storeId },
      relations: options.relations ?? ['adAccount'],
    });

    if (!execution) {
      throw new BadRequestException(`Execução ${executionId} não encontrada`);
    }

    await this.accessScope.validateAdAccountInStoreAccess(
      user,
      storeId,
      execution.adAccountId,
    );

    if (execution.campaignId) {
      await this.accessScope.validateCampaignInAdAccountAccess(
        user,
        storeId,
        execution.adAccountId,
        execution.campaignId,
      );
    }

    return execution;
  }

  private async validateCanManage(storeId: string, user: AuthenticatedUser): Promise<void> {
    await this.accessScope.validateStoreAccess(user, storeId);
    if (![Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL].includes(user.role)) {
      throw new ForbiddenException('Apenas PLATFORM_ADMIN, ADMIN e OPERATIONAL podem gerenciar recuperações de campanhas Meta');
    }
  }

  private async getRecoveryContext(execution: MetaCampaignCreation, dto?: RetryPartialCampaignDto) {
    const baseContext = await this.getBaseMetaContext(execution);
    const { integration, adAccount } = baseContext;

    const pageId = this.getMetadataString(integration.metadata, ['pageId', 'metaPageId', 'facebookPageId']);
    if (!pageId) {
      throw new BadRequestException('Meta pageId é obrigatório para recuperar a criação da campanha');
    }

    const requestPayload = (execution.requestPayload || {}) as Record<string, unknown>;
    const assetId = this.stringValue(dto?.assetId) || this.stringValue(requestPayload.assetId);
    const imageHash = this.stringValue(dto?.imageHash) || this.stringValue(requestPayload.imageHash);
    let imageUrl = this.stringValue(dto?.imageUrl) || this.stringValue(requestPayload.imageUrl);
    if (assetId) {
      const asset = await this.assetsService.getAssetForStore(execution.storeId, assetId);
      if (asset.type !== 'image') {
        throw new BadRequestException('O asset selecionado precisa ser uma imagem');
      }
      imageUrl = asset.storageUrl;
    }
    const destinationUrl = this.stringValue(dto?.destinationUrl)
      || this.stringValue(requestPayload.destinationUrl)
      || this.stringValue(integration.metadata?.['destinationUrl'])
      || this.stringValue(integration.metadata?.['websiteUrl']);

    if (!imageUrl) {
      throw new BadRequestException('imageUrl é obrigatório para recuperar a criação da campanha');
    }

    if (!isValidMetaHttpUrl(imageUrl) || !isLikelyDirectImageUrl(imageUrl)) {
      throw new BadRequestException('imageUrl inválido para recuperar a criação da campanha');
    }

    const initialStatus = this.stringValue(dto?.initialStatus)
      || this.stringValue(requestPayload.initialStatus)
      || 'PAUSED';
    const rawCta = this.stringValue(dto?.cta) || this.stringValue(requestPayload.cta);
    const placements = this.normalizeStringArray(dto?.placements, requestPayload.placements);
    const specialAdCategories = this.normalizeStringArray(dto?.specialAdCategories, requestPayload.specialAdCategories);

    const createDto: CreateMetaCampaignDto = {
      name: this.stringValue(dto?.name) || this.stringValue(requestPayload.name),
      objective: this.stringValue(dto?.objective) || this.stringValue(requestPayload.objective) || 'OUTCOME_TRAFFIC',
      dailyBudget: Number(dto?.dailyBudget ?? requestPayload.dailyBudget),
      startTime: this.stringValue(dto?.startTime) || this.stringValue(requestPayload.startTime) || new Date().toISOString(),
      endTime: this.stringValue(dto?.endTime) || this.stringValue(requestPayload.endTime) || undefined,
      country: this.stringValue(dto?.country) || this.stringValue(requestPayload.country) || 'BR',
      ageMin: Number(dto?.ageMin ?? requestPayload.ageMin) || 18,
      ageMax: Number(dto?.ageMax ?? requestPayload.ageMax) || 65,
      gender: this.normalizeRecoveryGender(dto?.gender ?? requestPayload.gender),
      adAccountId: adAccount.id,
      assetId: assetId || undefined,
      imageHash: imageHash || undefined,
      message: this.stringValue(dto?.message) || this.stringValue(requestPayload.message),
      imageUrl,
      state: this.stringValue(dto?.state) || this.stringValue(requestPayload.state) || undefined,
      stateName: this.stringValue(dto?.stateName) || this.stringValue(requestPayload.stateName) || undefined,
      region: this.stringValue(dto?.region) || this.stringValue(requestPayload.region) || undefined,
      city: this.stringValue(dto?.city) || this.stringValue(requestPayload.city) || undefined,
      cityId: Number(dto?.cityId ?? requestPayload.cityId) || undefined,
      destinationUrl,
      headline: this.stringValue(dto?.headline) || this.stringValue(requestPayload.headline) || undefined,
      description: this.stringValue(dto?.description) || this.stringValue(requestPayload.description) || undefined,
      cta: rawCta ? normalizeMetaCtaType(rawCta) : undefined,
      pixelId: this.stringValue(dto?.pixelId) || this.stringValue(requestPayload.pixelId) || undefined,
      conversionEvent: this.stringValue(dto?.conversionEvent) || this.stringValue(requestPayload.conversionEvent) || undefined,
      placements: placements.length ? placements : undefined,
      specialAdCategories: specialAdCategories.length ? specialAdCategories : undefined,
      initialStatus: initialStatus === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
    };

    if (!createDto.name || !createDto.message || !Number.isFinite(createDto.dailyBudget) || createDto.dailyBudget <= 0) {
      throw new BadRequestException('Payload de recuperação incompleto para retomar a campanha');
    }

    if (!isValidMetaHttpsUrl(destinationUrl)) {
      throw new BadRequestException('destination_url inválido para recuperar a criação da campanha');
    }

    if (createDto.headline && createDto.headline.length > 80) {
      throw new BadRequestException('headline excede o limite permitido para recuperar a campanha');
    }

    if (createDto.description && createDto.description.length > 120) {
      throw new BadRequestException('description excede o limite permitido para recuperar a campanha');
    }

    return {
      ...baseContext,
      pageId,
      destinationUrl,
      objective: this.normalizeCreateObjective(createDto.objective),
      dto: createDto,
    };
  }

  private async getCleanupContext(execution: MetaCampaignCreation) {
    const context = await this.getBaseMetaContext(execution);
    return {
      accessToken: context.accessToken,
      adAccountExternalId: context.adAccountExternalId,
    };
  }

  private async getBaseMetaContext(execution: MetaCampaignCreation) {
    const integration = await this.integrationRepository
      .createQueryBuilder('integration')
      .addSelect(['integration.accessToken'])
      .where('integration.storeId = :storeId', { storeId: execution.storeId })
      .andWhere('integration.provider = :provider', { provider: IntegrationProvider.META })
      .getOne();

    if (!integration || integration.status !== IntegrationStatus.CONNECTED || !integration.accessToken) {
      throw new BadRequestException('Store não está conectada à Meta ou token ausente');
    }

    if (integration.tokenExpiresAt && integration.tokenExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Token Meta expirado. Reconecte a store.');
    }

    const adAccount = execution.adAccount || await this.adAccountRepository.findOne({
      where: { id: execution.adAccountId, storeId: execution.storeId, provider: IntegrationProvider.META },
    });

    if (!adAccount) {
      throw new BadRequestException('AdAccount Meta da execução não encontrada');
    }

    if (adAccount.storeId !== execution.storeId) {
      throw new ForbiddenException('AdAccount fora da store da execução');
    }

    return {
      accessToken: integration.accessToken,
      adAccountExternalId: this.normalizeAdAccountExternalId(adAccount.externalId || adAccount.metaId),
      integration,
      adAccount,
    };
  }

  private async recordRecoveredCampaign(execution: MetaCampaignCreation, dto: CreateMetaCampaignDto): Promise<Campaign> {
    const now = new Date();
    const existing = await this.campaignRepository.findOne({
      where: { storeId: execution.storeId, externalId: execution.metaCampaignId },
    });

    if (existing) {
      existing.name = dto.name;
      existing.status = dto.initialStatus === 'ACTIVE' ? 'ACTIVE' : 'PAUSED';
      existing.objective = this.normalizeLocalObjective(dto.objective);
      existing.dailyBudget = dto.dailyBudget;
      existing.adAccountId = execution.adAccountId;
      existing.lastSeenAt = now;
      return this.campaignRepository.save(existing);
    }

    return this.campaignRepository.save(
      this.campaignRepository.create({
        metaId: execution.metaCampaignId as string,
        externalId: execution.metaCampaignId as string,
        name: dto.name,
        status: dto.initialStatus === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
        objective: this.normalizeLocalObjective(dto.objective),
        dailyBudget: dto.dailyBudget,
        startTime: now,
        userId: execution.requesterUserId,
        createdByUserId: execution.requesterUserId,
        storeId: execution.storeId,
        adAccountId: execution.adAccountId,
        lastSeenAt: now,
      }),
    );
  }

  private getMetadataString(metadata: Record<string, unknown> | null | undefined, keys: string[]): string | null {
    for (const key of keys) {
      const value = metadata?.[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private normalizeAdAccountExternalId(adAccountId: string): string {
    const normalized = adAccountId.trim();
    return normalized.startsWith('act_') ? normalized : `act_${normalized}`;
  }

  private normalizeRecoveryGender(value: unknown): 'ALL' | 'MALE' | 'FEMALE' {
    const normalized = this.stringValue(value).toUpperCase();
    return normalized === 'MALE' || normalized === 'FEMALE' ? normalized : 'ALL';
  }

  private normalizeStringArray(...values: unknown[]): string[] {
    for (const value of values) {
      if (!Array.isArray(value)) {
        continue;
      }

      const normalized = value
        .map((item) => this.stringValue(item))
        .filter(Boolean);

      if (normalized.length) {
        return Array.from(new Set(normalized));
      }
    }

    return [];
  }

  private normalizeCreateObjective(objective: string): string {
    const normalized = objective.trim().toUpperCase();
    if (normalized === 'TRAFFIC') return 'OUTCOME_TRAFFIC';
    return normalized || 'OUTCOME_TRAFFIC';
  }

  private previousStep(step: string | null | undefined): string | null {
    if (step === 'adset') return 'campaign';
    if (step === 'creative') return 'adset';
    if (step === 'ad') return 'creative';
    if (step === 'persist') return 'ad';
    return null;
  }

  private normalizeLocalObjective(objective: string): 'CONVERSIONS' | 'REACH' | 'TRAFFIC' | 'LEADS' {
    const normalized = objective.trim().toUpperCase();
    if (normalized === 'REACH') return 'REACH';
    if (normalized === 'LEADS' || normalized === 'OUTCOME_LEADS') return 'LEADS';
    if (normalized === 'CONVERSIONS' || normalized === 'OUTCOME_SALES') return 'CONVERSIONS';
    return 'TRAFFIC';
  }

  private buildRecoveryHint(
    step: string | null | undefined,
    dto: CreateMetaCampaignDto,
    pageId: string,
    destinationUrl: string,
    metaError?: MetaCampaignStoredMetaError | null,
  ): string {
    const metaUserMessage = this.normalizeRecoveryUserMessage(metaError?.userMessage);
    if (metaUserMessage) {
      return metaUserMessage;
    }

    if (step === 'creative') {
      if (!pageId) {
        return 'Configure o pageId da store antes de retomar a criação do criativo.';
      }

      if (!isValidMetaHttpsUrl(destinationUrl)) {
        return 'Verifique se o destination_url está preenchido com uma URL https válida.';
      }

      return 'Revise pageId, destination_url https, texto do anúncio e imagem do criativo antes de retomar.';
    }

    if (step === 'adset') {
      return 'Revise daily_budget e segmentação mínima antes de retomar o conjunto de anúncios.';
    }

    if (step === 'campaign') {
      return 'Revise nome, objetivo e permissões da conta de anúncios antes de retomar a campanha.';
    }

    if (step === 'ad') {
      return 'Confirme que o creative e o adset foram criados corretamente antes de retomar o anúncio.';
    }

    return `Revise os dados obrigatórios da campanha "${dto.name}" antes de tentar novamente.`;
  }

  private normalizeRecoveryUserMessage(message: string | null | undefined): string | null {
    if (!message) {
      return null;
    }

    return message
      .replace(/\bpage_id\b/gi, 'pageId')
      .replace(/\bdestination_url\b/gi, 'destinationUrl');
  }

  private describeStep(step: string | null | undefined): string {
    if (step === 'campaign') return 'a criação da campanha';
    if (step === 'adset') return 'a criação do conjunto de anúncios';
    if (step === 'creative') return 'a criação do criativo';
    if (step === 'ad') return 'a criação do anúncio';
    return 'a execução parcial';
  }

  private executionPartialIds(execution: MetaCampaignCreation): Record<string, string | null> {
    return {
      campaignId: execution.metaCampaignId ?? null,
      adSetId: execution.metaAdSetId ?? null,
      creativeId: execution.metaCreativeId ?? null,
      adId: execution.metaAdId ?? null,
    };
  }

  private buildRecoveryPayloadLog(dto: CreateMetaCampaignDto, pageId: string, destinationUrl: string): Record<string, unknown> {
    return {
      name: dto.name,
      objective: dto.objective,
      dailyBudget: dto.dailyBudget,
      country: dto.country,
      adAccountId: dto.adAccountId,
      pageId,
      destinationUrl,
      hasMessage: Boolean(dto.message),
      headline: dto.headline ?? null,
      description: dto.description ?? null,
      imageUrl: dto.imageUrl,
      cta: dto.cta ?? null,
      initialStatus: dto.initialStatus ?? 'PAUSED',
    };
  }

  private normalizeRecoveryStep(step: string): MetaCampaignCreationStep {
    if (step === 'campaign' || step === 'adset' || step === 'creative' || step === 'ad') {
      return step;
    }

    return 'persist';
  }

  private toStoredMetaError(step: MetaCampaignCreationStep, error: unknown): MetaCampaignStoredMetaError | null {
    const metaPayload = (error as any)?.payload;
    const meta = (error as any)?.response?.data?.error;
    const message = this.sanitizeError(
      metaPayload?.metaMessage || meta?.message || (error as Error)?.message || 'Erro ao retomar campanha na Meta',
    );

    const stored: MetaCampaignStoredMetaError = {
      step,
      message,
      code: metaPayload?.metaCode ?? meta?.code ?? null,
      subcode: metaPayload?.metaSubcode ?? meta?.error_subcode ?? null,
      type: metaPayload?.metaType ?? meta?.type ?? null,
      userTitle: this.sanitizeNullableText(metaPayload?.metaUserTitle ?? meta?.error_user_title ?? null),
      userMessage: this.sanitizeNullableText(metaPayload?.metaUserMessage ?? meta?.error_user_msg ?? null),
      fbtraceId: this.sanitizeNullableText(metaPayload?.fbtraceId ?? meta?.fbtrace_id ?? null),
    };

    if (
      !stored.message
      && stored.code == null
      && stored.subcode == null
      && !stored.type
      && !stored.userTitle
      && !stored.userMessage
      && !stored.fbtraceId
    ) {
      return null;
    }

    return stored;
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

  private sanitizeNullableText(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    return this.sanitizeError(value);
  }

  private sanitizeError(message: string): string {
    return String(message || '')
      .replace(/[?&](access_token|client_secret|code)=[^&\s]+/gi, '$1=[redacted]')
      .slice(0, 500);
  }

  private logRecovery(event: string, payload: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({ event, ...payload }));
  }
}
