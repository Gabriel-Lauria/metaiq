import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetaCampaignCreation, MetaCampaignCreationStatus } from './meta-campaign-creation.entity';
import { MetaCampaignOrchestrator } from './meta-campaign.orchestrator';
import { MetaGraphApiClient } from './meta-graph-api.client';
import { CreateMetaCampaignDto, RetryPartialCampaignDto } from './dto/meta-integration.dto';
import { AuthenticatedUser } from '../../../common/interfaces';
import { AccessScopeService } from '../../../common/services/access-scope.service';
import { IntegrationProvider, IntegrationStatus, Role } from '../../../common/enums';
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
  ) {}

  /**
   * ✅ RETRY: Continua uma criação de campanha que parou no meio
   * 
   * Exemplo:
   * - Campaign criado ✅ (ID: 123)
   * - AdSet falhou ❌
   * - Chama retry() → tenta criar AdSet, Creative, Ad a partir de onde parou
   */
  async retryPartialCampaignCreation(
    executionId: string,
    dto: RetryPartialCampaignDto,
    storeId: string,
    user: AuthenticatedUser,
  ): Promise<{ success: boolean; message: string; ids?: Record<string, string> }> {
    await this.validateCanManage(storeId, user);
    const execution = await this.getScopedExecution(executionId, storeId, user);

    if (execution.status === MetaCampaignCreationStatus.ACTIVE) {
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

    if (execution.status === MetaCampaignCreationStatus.CREATING) {
      throw new HttpException(
        {
          message: 'Execução ainda está em andamento. Aguarde alguns minutos.',
          executionId,
        },
        HttpStatus.CONFLICT,
      );
    }

    if (execution.status === MetaCampaignCreationStatus.FAILED) {
      throw new BadRequestException({
        message: 'Esta campanha falhou completamente. Inicie uma nova criação.',
        executionId,
        errorStep: execution.errorStep,
        errorMessage: execution.errorMessage,
      });
    }

    // Status = PARTIAL - vamos tentar recuperar
    const context = await this.getRecoveryContext(execution, dto);
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
  async cleanupPartialResources(
    executionId: string,
    storeId: string,
    user: AuthenticatedUser,
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
      await this.campaignCreationRepository.save(execution);

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
  async getExecutionStatus(executionId: string, storeId: string, user: AuthenticatedUser) {
    await this.validateCanManage(storeId, user);
    const execution = await this.campaignCreationRepository.findOne({
      where: { id: executionId, storeId },
      relations: ['store', 'adAccount', 'campaign'],
    });

    if (!execution) {
      throw new BadRequestException(`Execução ${executionId} não encontrada`);
    }

    return {
      id: execution.id,
      status: execution.status,
      idempotencyKey: execution.idempotencyKey,
      step: execution.errorStep,
      message: execution.errorMessage,
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

    const createdIds: Record<string, string | undefined> = {
      campaignId: execution.metaCampaignId || undefined,
      adSetId: execution.metaAdSetId || undefined,
      creativeId: execution.metaCreativeId || undefined,
      adId: execution.metaAdId || undefined,
    };

    execution.status = MetaCampaignCreationStatus.CREATING;
    execution.errorStep = null;
    execution.errorMessage = null;
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
        startingIds: createdIds as any,
        onStepCreated: async (step, ids) => {
          Object.assign(createdIds, ids);
          this.applyCreatedIdsToExecution(execution, createdIds);
          await this.campaignCreationRepository.save(execution);
          this.logger.log(`Step ${step} completado ao resumir`);
        },
      });

      Object.assign(createdIds, resumedIds);

      execution.status = MetaCampaignCreationStatus.ACTIVE;
      this.applyCreatedIdsToExecution(execution, createdIds);
      const localCampaign = await this.recordRecoveredCampaign(execution, dto);
      execution.campaignId = localCampaign.id;
      await this.campaignCreationRepository.save(execution);

      return {
        success: true,
        message: 'Campanha retomada e concluída com sucesso',
        ids: createdIds,
      };
    } catch (error) {
      execution.status = MetaCampaignCreationStatus.PARTIAL;
      execution.errorStep = this.resolveFailedStep(createdIds);
      execution.errorMessage = (error as Error).message;
      this.applyCreatedIdsToExecution(execution, createdIds);
      await this.campaignCreationRepository.save(execution);

      throw new HttpException(
        {
          message: `Falha ao retomar em ${execution.errorStep}`,
          executionId: execution.id,
          step: execution.errorStep,
          partialIds: createdIds,
          error: (error as Error).message,
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
  ): Promise<MetaCampaignCreation> {
    await this.accessScope.validateStoreAccess(user, storeId);
    const execution = await this.campaignCreationRepository.findOne({
      where: { id: executionId, storeId },
      relations: ['adAccount'],
    });

    if (!execution) {
      throw new BadRequestException(`Execução ${executionId} não encontrada`);
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
    const imageUrl = this.stringValue(dto?.imageUrl) || this.stringValue(requestPayload.imageUrl);
    const destinationUrl = this.stringValue(dto?.destinationUrl)
      || this.stringValue(requestPayload.destinationUrl)
      || this.stringValue(integration.metadata?.['destinationUrl'])
      || this.stringValue(integration.metadata?.['websiteUrl']);

    if (!imageUrl) {
      throw new BadRequestException('imageUrl é obrigatório para recuperar a criação da campanha');
    }

    if (!this.isValidHttpUrl(destinationUrl)) {
      throw new BadRequestException('destinationUrl http(s) é obrigatório para recuperar a criação da campanha');
    }

    const initialStatus = this.stringValue(dto?.initialStatus)
      || this.stringValue(requestPayload.initialStatus)
      || 'PAUSED';

    const createDto: CreateMetaCampaignDto = {
      name: this.stringValue(dto?.name) || this.stringValue(requestPayload.name),
      objective: this.stringValue(dto?.objective) || this.stringValue(requestPayload.objective) || 'OUTCOME_TRAFFIC',
      dailyBudget: Number(dto?.dailyBudget ?? requestPayload.dailyBudget),
      country: this.stringValue(dto?.country) || this.stringValue(requestPayload.country) || 'BR',
      adAccountId: adAccount.id,
      message: this.stringValue(dto?.message) || this.stringValue(requestPayload.message),
      imageUrl,
      destinationUrl,
      headline: this.stringValue(dto?.headline) || this.stringValue(requestPayload.headline) || undefined,
      description: this.stringValue(dto?.description) || this.stringValue(requestPayload.description) || undefined,
      cta: this.stringValue(dto?.cta) || this.stringValue(requestPayload.cta) || undefined,
      initialStatus: initialStatus === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
    };

    if (!createDto.name || !createDto.message || !Number.isFinite(createDto.dailyBudget) || createDto.dailyBudget <= 0) {
      throw new BadRequestException('Payload de recuperação incompleto para retomar a campanha');
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

  private normalizeCreateObjective(objective: string): string {
    const normalized = objective.trim().toUpperCase();
    if (normalized === 'TRAFFIC') return 'OUTCOME_TRAFFIC';
    return normalized || 'OUTCOME_TRAFFIC';
  }

  private normalizeLocalObjective(objective: string): 'CONVERSIONS' | 'REACH' | 'TRAFFIC' | 'LEADS' {
    const normalized = objective.trim().toUpperCase();
    if (normalized === 'REACH') return 'REACH';
    if (normalized === 'LEADS' || normalized === 'OUTCOME_LEADS') return 'LEADS';
    if (normalized === 'CONVERSIONS' || normalized === 'OUTCOME_SALES') return 'CONVERSIONS';
    return 'TRAFFIC';
  }

  private isValidHttpUrl(value?: string | null): boolean {
    if (!value) {
      return false;
    }

    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
