import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MetaCampaignCreation,
  MetaCampaignCreationStatus,
  MetaCampaignCreationStep,
  MetaCampaignStoredMetaError,
  MetaCampaignExecutionIds,
  MetaCampaignExecutionStepStateMap,
} from './meta-campaign-creation.entity';
import { MetaCampaignOrchestrator } from './meta-campaign.orchestrator';
import { MetaGraphApiClient } from './meta-graph-api.client';
import { CreateMetaCampaignDto, RetryPartialCampaignDto } from './dto/meta-integration.dto';
import { normalizeMetaCtaType } from './meta-cta.constants';
import { buildMetaCreativePayload, isLikelyDirectImageUrl, isValidMetaHttpUrl, isValidMetaHttpsUrl } from './meta-creative.validation';
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
  ): Promise<{ success: boolean; message: string; cleaned: Record<string, boolean>; cleanupPending?: boolean; executionStatus?: MetaCampaignCreationStatus }> {
    await this.validateCanManage(storeId, user);
    const execution = await this.getScopedExecution(executionId, storeId, user);

    if (
      execution.status !== MetaCampaignCreationStatus.PARTIAL
      && execution.status !== MetaCampaignCreationStatus.FAILED
      && execution.status !== MetaCampaignCreationStatus.PARTIAL_ROLLBACK
      && execution.status !== MetaCampaignCreationStatus.CLEANUP_FAILED
    ) {
      throw new BadRequestException({
        message: 'Somente execuções PARTIAL, FAILED, PARTIAL_ROLLBACK ou CLEANUP_FAILED podem ser limpas',
        currentStatus: execution.status,
      });
    }

    const cleaned: Record<string, boolean> = {
      ad: false,
      creative: false,
      adset: false,
      campaign: false,
    };
    const cleanupErrors: Array<{ resource: keyof typeof cleaned; id: string; message: string }> = [];

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
          const adId = execution.metaAdId;
          await this.deleteMetaResource(adId, accessToken);
          cleaned.ad = true;
          execution.metaAdId = null;
          execution.adCreated = false;
          this.logger.log(`Removido Ad ${adId}`);
        } catch (e) {
          this.logger.warn(`Falha ao remover Ad ${execution.metaAdId}: ${(e as Error).message}`);
          cleanupErrors.push({ resource: 'ad', id: execution.metaAdId, message: (e as Error).message });
        }
      }

      if (execution.metaCreativeId) {
        try {
          const creativeId = execution.metaCreativeId;
          await this.deleteMetaResource(creativeId, accessToken);
          cleaned.creative = true;
          execution.metaCreativeId = null;
          execution.creativeCreated = false;
          this.logger.log(`Removido Creative ${creativeId}`);
        } catch (e) {
          this.logger.warn(`Falha ao remover Creative ${execution.metaCreativeId}: ${(e as Error).message}`);
          cleanupErrors.push({ resource: 'creative', id: execution.metaCreativeId, message: (e as Error).message });
        }
      }

      if (execution.metaAdSetId) {
        try {
          const adSetId = execution.metaAdSetId;
          await this.deleteMetaResource(adSetId, accessToken);
          cleaned.adset = true;
          execution.metaAdSetId = null;
          execution.adSetCreated = false;
          this.logger.log(`Removido AdSet ${adSetId}`);
        } catch (e) {
          this.logger.warn(`Falha ao remover AdSet ${execution.metaAdSetId}: ${(e as Error).message}`);
          cleanupErrors.push({ resource: 'adset', id: execution.metaAdSetId, message: (e as Error).message });
        }
      }

      if (execution.metaCampaignId) {
        try {
          const campaignId = execution.metaCampaignId;
          await this.deleteMetaResource(campaignId, accessToken);
          cleaned.campaign = true;
          execution.metaCampaignId = null;
          execution.campaignCreated = false;
          this.logger.log(`Removido Campaign ${campaignId}`);
        } catch (e) {
          this.logger.warn(`Falha ao remover Campaign ${execution.metaCampaignId}: ${(e as Error).message}`);
          cleanupErrors.push({ resource: 'campaign', id: execution.metaCampaignId, message: (e as Error).message });
        }
      }

      execution.canRetry = false;
      execution.currentStep = null;
      execution.metaErrorDetails = null;

      if (cleanupErrors.length > 0) {
        const hasAnyCleanup = Object.values(cleaned).some(Boolean);
        execution.status = hasAnyCleanup
          ? MetaCampaignCreationStatus.PARTIAL_ROLLBACK
          : MetaCampaignCreationStatus.CLEANUP_FAILED;
        execution.errorMessage = cleanupErrors
          .map((item) => `${item.resource}:${item.message}`)
          .join(' | ');
        execution.userMessage = 'A limpeza falhou parcialmente. Existem recursos órfãos na Meta e a execução exige intervenção.';
        await this.campaignCreationRepository.save(execution);
        this.logRecovery('rollback_failed', {
          executionId: execution.id,
          storeId: execution.storeId,
          idempotencyKey: execution.idempotencyKey,
          step: execution.errorStep,
          previousStep: this.previousStep(execution.errorStep),
          partialIds: this.executionPartialIds(execution),
          cleaned,
          cleanupErrors,
        });

        throw new HttpException(
          {
            message: 'Cleanup falhou parcialmente. Ainda existem recursos órfãos na Meta.',
            executionId,
            executionStatus: execution.status,
            cleanupPending: true,
            cleaned,
            partialIds: this.executionPartialIds(execution),
            cleanupErrors,
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      execution.status = MetaCampaignCreationStatus.FAILED;
      execution.errorMessage = 'Cleanup concluído sem recursos órfãos';
      execution.userMessage = null;
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
        cleanupPending: false,
        executionStatus: execution.status,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

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
    const failedStep = this.resolveExecutionStep(execution, initialIds);

    execution.status = MetaCampaignCreationStatus.IN_PROGRESS;
    execution.errorStep = null;
    execution.errorMessage = null;
    execution.currentStep = failedStep;
    execution.canRetry = false;
    execution.retryCount = (execution.retryCount ?? 0) + 1;
    execution.lastRetryAt = new Date();
    execution.userMessage = null;
    execution.metaErrorDetails = null;
    execution.stepState = this.markExecutionStepInProgress(execution.stepState, failedStep);
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
        onImageHashResolved: async (imageHash) => {
          await this.persistResolvedCreativeSnapshot(execution, dto, pageId, destinationUrl, imageHash);
        },
        onStepCreated: async (step, ids) => {
          Object.assign(createdIds, ids);
          this.applyCreatedIdsToExecution(execution, createdIds);
          execution.currentStep = this.nextExecutionStep(step);
          execution.stepState = this.completeExecutionStep(execution.stepState, step, createdIds);
          if (execution.currentStep) {
            execution.stepState = this.markExecutionStepInProgress(
              execution.stepState,
              execution.currentStep as MetaCampaignCreationStep,
            );
          }
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
      execution.metaErrorDetails = null;
      execution.stepState = this.completeExecutionStep(execution.stepState, 'persist', createdIds);
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
      execution.stepState = this.failExecutionStep(
        execution.stepState,
        execution.errorStep as MetaCampaignCreationStep,
        (error as Error).message,
        createdIds,
      );
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
    if (![Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL].includes(user.role)) {
      throw new ForbiddenException('Apenas PLATFORM_ADMIN, ADMIN, MANAGER e OPERATIONAL podem gerenciar recuperações de campanhas Meta');
    }
  }

  private async getRecoveryContext(execution: MetaCampaignCreation, _dto?: RetryPartialCampaignDto) {
    const baseContext = await this.getBaseMetaContext(execution);
    const { integration, adAccount } = baseContext;
    const requestPayload = (execution.requestPayload || {}) as Record<string, unknown>;

    const pageId = this.stringValue(requestPayload.pageId)
      || this.getMetadataString(integration.metadata, ['pageId', 'metaPageId', 'facebookPageId'])
      || '';
    if (!pageId) {
      throw new BadRequestException('Meta pageId é obrigatório para recuperar a criação da campanha');
    }
    const createDto = await this.restoreOriginalCreateDto(execution, adAccount.id, integration);
    const destinationUrl = createDto.destinationUrl || '';

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

  private async restoreOriginalCreateDto(
    execution: MetaCampaignCreation,
    adAccountId: string,
    integration: StoreIntegration,
  ): Promise<CreateMetaCampaignDto> {
    const requestPayload = (execution.requestPayload || {}) as Record<string, unknown>;
    if (!Object.keys(requestPayload).length) {
      throw new BadRequestException('Payload original da execução não está disponível para recovery.');
    }

    const imageAssetId = this.stringValue(requestPayload.imageAssetId) || this.stringValue(requestPayload.assetId);
    let imageHash = this.stringValue(requestPayload.imageHash);
    let imageUrl = this.stringValue(requestPayload.imageUrl);

    if (imageAssetId) {
      const asset = await this.assetsService.getAssetForStore(execution.storeId, imageAssetId);
      if (asset.type !== 'image') {
        throw new BadRequestException('O asset original da execução não é uma imagem válida.');
      }
      if (asset.adAccountId && asset.adAccountId !== adAccountId) {
        throw new BadRequestException('O asset original pertence a outra conta de anúncios.');
      }
      imageHash = asset.metaImageHash || imageHash;
      imageUrl = asset.storageUrl;
    } else if (imageHash) {
      const asset = await this.assetsService.findImageAssetByMetaHash(execution.storeId, imageHash, adAccountId);
      if (!asset) {
        throw new BadRequestException('O image_hash original da execução não pertence à store ou à conta selecionada.');
      }
      imageHash = asset.metaImageHash || imageHash;
      imageUrl = asset.storageUrl;
    }

    const destinationUrl = this.stringValue(requestPayload.destinationUrl)
      || this.stringValue(integration.metadata?.['destinationUrl'])
      || this.stringValue(integration.metadata?.['websiteUrl']);

    if (!imageUrl && !imageHash) {
      throw new BadRequestException('O payload original não possui imagem recuperável para retry.');
    }

    if (imageUrl && (!isValidMetaHttpUrl(imageUrl) || !isLikelyDirectImageUrl(imageUrl))) {
      throw new BadRequestException('imageUrl original inválido para recuperar a criação da campanha');
    }

    if (!isValidMetaHttpsUrl(destinationUrl)) {
      throw new BadRequestException('destination_url inválido para recuperar a criação da campanha');
    }

    const dto: CreateMetaCampaignDto = {
      name: this.stringValue(requestPayload.name),
      objective: this.stringValue(requestPayload.objective) || 'OUTCOME_TRAFFIC',
      dailyBudget: Number(requestPayload.dailyBudget),
      startTime: this.stringValue(requestPayload.startTime),
      endTime: this.stringValue(requestPayload.endTime) || undefined,
      country: this.stringValue(requestPayload.country) || 'BR',
      ageMin: Number(requestPayload.ageMin),
      ageMax: Number(requestPayload.ageMax),
      gender: (this.stringValue(requestPayload.gender) || 'ALL') as 'ALL' | 'MALE' | 'FEMALE',
      adAccountId,
      message: this.stringValue(requestPayload.message),
      imageAssetId: imageAssetId || undefined,
      assetId: imageAssetId || undefined,
      imageHash: imageHash || undefined,
      imageUrl: imageUrl || undefined,
      state: this.stringValue(requestPayload.state) || undefined,
      stateName: this.stringValue(requestPayload.stateName) || undefined,
      region: this.stringValue(requestPayload.region) || undefined,
      city: this.stringValue(requestPayload.city) || undefined,
      cityId: Number.isFinite(Number(requestPayload.cityId)) && Number(requestPayload.cityId) > 0 ? Number(requestPayload.cityId) : undefined,
      destinationUrl,
      headline: this.stringValue(requestPayload.headline) || undefined,
      description: this.stringValue(requestPayload.description) || undefined,
      cta: this.stringValue(requestPayload.cta) ? normalizeMetaCtaType(this.stringValue(requestPayload.cta)) : undefined,
      initialStatus: 'PAUSED',
      pixelId: this.stringValue(requestPayload.pixelId) || undefined,
      conversionEvent: this.stringValue(requestPayload.conversionEvent) || undefined,
      placements: Array.isArray(requestPayload.placements)
        ? requestPayload.placements.map((item) => this.stringValue(item)).filter(Boolean)
        : undefined,
      specialAdCategories: Array.isArray(requestPayload.specialAdCategories)
        ? requestPayload.specialAdCategories.map((item) => this.stringValue(item)).filter(Boolean)
        : undefined,
      utmSource: this.stringValue(requestPayload.utmSource) || undefined,
      utmMedium: this.stringValue(requestPayload.utmMedium) || undefined,
      utmCampaign: this.stringValue(requestPayload.utmCampaign) || undefined,
      utmContent: this.stringValue(requestPayload.utmContent) || undefined,
      utmTerm: this.stringValue(requestPayload.utmTerm) || undefined,
    };

    if (!dto.name || !dto.message || !Number.isFinite(dto.dailyBudget) || dto.dailyBudget <= 0) {
      throw new BadRequestException('Payload original incompleto para retomar a campanha');
    }

    return dto;
  }

  private async persistResolvedCreativeSnapshot(
    execution: MetaCampaignCreation,
    dto: CreateMetaCampaignDto,
    pageId: string,
    destinationUrl: string,
    imageHash: string,
  ): Promise<void> {
    if (!imageHash?.trim()) {
      return;
    }

    const requestPayload = this.asMutableRecord(execution.requestPayload);
    requestPayload.imageHash = imageHash.trim();

    const snapshot = this.asMutableRecord(requestPayload.metaPayloadSnapshot);
    snapshot.creative = buildMetaCreativePayload({
      campaignName: dto.name,
      pageId,
      destinationUrl,
      message: dto.message,
      headline: dto.headline,
      description: dto.description,
      imageUrl: dto.imageUrl,
      imageHash: imageHash.trim(),
      cta: dto.cta,
    });
    requestPayload.metaPayloadSnapshot = snapshot;
    execution.requestPayload = requestPayload;

    await this.campaignCreationRepository.save(execution);
  }

  private async recordRecoveredCampaign(execution: MetaCampaignCreation, dto: CreateMetaCampaignDto): Promise<Campaign> {
    const now = new Date();
    const startTime = dto.startTime ? new Date(dto.startTime) : now;
    const endTime = dto.endTime ? new Date(dto.endTime) : null;
    const existing = await this.campaignRepository.findOne({
      where: { storeId: execution.storeId, externalId: execution.metaCampaignId },
    });

    if (existing) {
      existing.name = dto.name;
      existing.status = 'PAUSED';
      existing.objective = this.normalizeLocalObjective(dto.objective);
      existing.dailyBudget = dto.dailyBudget;
      existing.startTime = startTime;
      existing.endTime = endTime;
      existing.adAccountId = execution.adAccountId;
      existing.lastSeenAt = now;
      return this.campaignRepository.save(existing);
    }

    return this.campaignRepository.save(
      this.campaignRepository.create({
        metaId: execution.metaCampaignId as string,
        externalId: execution.metaCampaignId as string,
        name: dto.name,
        status: 'PAUSED',
        objective: this.normalizeLocalObjective(dto.objective),
        dailyBudget: dto.dailyBudget,
        startTime,
        endTime,
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

  private asMutableRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return { ...(value as Record<string, unknown>) };
  }

  private normalizeAdAccountExternalId(adAccountId: string): string {
    const normalized = adAccountId.trim();
    return normalized.startsWith('act_') ? normalized : `act_${normalized}`;
  }

  private normalizeCreateObjective(objective: string): string {
    const normalized = objective.trim().toUpperCase();
    if (normalized === 'TRAFFIC') return 'OUTCOME_TRAFFIC';
    return normalized || 'OUTCOME_TRAFFIC';
  }

  private resolveExecutionStep(
    execution: MetaCampaignCreation,
    ids: Record<string, string | undefined>,
  ): MetaCampaignCreationStep {
    if (execution.errorStep) {
      return this.normalizeRecoveryStep(execution.errorStep);
    }

    const resolved = this.resolveFailedStep(ids);
    return resolved === 'unknown' ? 'persist' : this.normalizeRecoveryStep(resolved);
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

  private nextExecutionStep(step: MetaCampaignCreationStep): MetaCampaignCreationStep | null {
    const sequence: MetaCampaignCreationStep[] = ['campaign', 'adset', 'creative', 'ad', 'persist'];
    const index = sequence.indexOf(step);
    return index >= 0 && index < sequence.length - 1 ? sequence[index + 1] : null;
  }

  private markExecutionStepInProgress(
    stepState: MetaCampaignExecutionStepStateMap | null | undefined,
    step: MetaCampaignCreationStep,
  ): MetaCampaignExecutionStepStateMap {
    const next = this.cloneExecutionStepState(stepState);
    next[step] = {
      ...next[step],
      status: 'IN_PROGRESS',
      startedAt: next[step]?.startedAt ?? new Date().toISOString(),
      completedAt: null,
      failedAt: null,
      errorMessage: null,
    };
    return next;
  }

  private completeExecutionStep(
    stepState: MetaCampaignExecutionStepStateMap | null | undefined,
    step: MetaCampaignCreationStep,
    ids: Record<string, string | undefined>,
  ): MetaCampaignExecutionStepStateMap {
    const next = this.cloneExecutionStepState(stepState);
    next[step] = {
      ...next[step],
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
      failedAt: null,
      errorMessage: null,
      ids: this.toExecutionIds(ids),
    };
    return next;
  }

  private failExecutionStep(
    stepState: MetaCampaignExecutionStepStateMap | null | undefined,
    step: MetaCampaignCreationStep,
    message: string,
    ids: Record<string, string | undefined>,
  ): MetaCampaignExecutionStepStateMap {
    const next = this.cloneExecutionStepState(stepState);
    next[step] = {
      ...next[step],
      status: 'FAILED',
      failedAt: new Date().toISOString(),
      errorMessage: message,
      ids: this.toExecutionIds(ids),
    };
    return next;
  }

  private cloneExecutionStepState(
    stepState: MetaCampaignExecutionStepStateMap | null | undefined,
  ): MetaCampaignExecutionStepStateMap {
    if (stepState) {
      return JSON.parse(JSON.stringify(stepState)) as MetaCampaignExecutionStepStateMap;
    }

    return {
      campaign: { status: 'PENDING', startedAt: null, completedAt: null, failedAt: null, errorMessage: null },
      adset: { status: 'PENDING', startedAt: null, completedAt: null, failedAt: null, errorMessage: null },
      creative: { status: 'PENDING', startedAt: null, completedAt: null, failedAt: null, errorMessage: null },
      ad: { status: 'PENDING', startedAt: null, completedAt: null, failedAt: null, errorMessage: null },
      persist: { status: 'PENDING', startedAt: null, completedAt: null, failedAt: null, errorMessage: null },
    };
  }

  private toExecutionIds(ids: Record<string, string | undefined>): MetaCampaignExecutionIds {
    return {
      campaignId: ids.campaignId,
      adSetId: ids.adSetId,
      creativeId: ids.creativeId,
      adId: ids.adId,
    };
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
