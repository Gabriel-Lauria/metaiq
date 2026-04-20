import { Injectable, Logger, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetaCampaignCreation, MetaCampaignCreationStatus } from './meta-campaign-creation.entity';
import { MetaCampaignOrchestrator } from './meta-campaign.orchestrator';
import { MetaGraphApiClient } from './meta-graph-api.client';
import { CreateMetaCampaignDto } from './dto/meta-integration.dto';
import { AuthenticatedUser } from '../../../common/interfaces';

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
    private readonly campaignOrchestrator: MetaCampaignOrchestrator,
    private readonly graphApi: MetaGraphApiClient,
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
    accessToken: string,
    adAccountExternalId: string,
    dto: CreateMetaCampaignDto,
    pageId: string,
    destinationUrl: string,
    objective: string,
  ): Promise<{ success: boolean; message: string; ids?: Record<string, string> }> {
    const execution = await this.campaignCreationRepository.findOneBy({ id: executionId });

    if (!execution) {
      throw new BadRequestException(`Execução ${executionId} não encontrada`);
    }

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
    return this.resumeFromPartialFailure(execution, accessToken, adAccountExternalId, dto, pageId, destinationUrl, objective);
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
    accessToken: string,
    adAccountExternalId: string,
  ): Promise<{ success: boolean; message: string; cleaned: Record<string, boolean> }> {
    const execution = await this.campaignCreationRepository.findOneBy({ id: executionId });

    if (!execution) {
      throw new BadRequestException(`Execução ${executionId} não encontrada`);
    }

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

    const accountPath = adAccountExternalId.trim();

    try {
      // Remover em ordem inversa de dependência
      if (execution.metaAdId) {
        try {
          await this.deleteMetaResource(`${accountPath}/ads/${execution.metaAdId}`, accessToken);
          cleaned.ad = true;
          this.logger.log(`Removido Ad ${execution.metaAdId}`);
        } catch (e) {
          this.logger.warn(`Falha ao remover Ad ${execution.metaAdId}: ${(e as Error).message}`);
        }
      }

      if (execution.metaCreativeId) {
        try {
          await this.deleteMetaResource(`${accountPath}/adcreatives/${execution.metaCreativeId}`, accessToken);
          cleaned.creative = true;
          this.logger.log(`Removido Creative ${execution.metaCreativeId}`);
        } catch (e) {
          this.logger.warn(`Falha ao remover Creative ${execution.metaCreativeId}: ${(e as Error).message}`);
        }
      }

      if (execution.metaAdSetId) {
        try {
          await this.deleteMetaResource(`${accountPath}/adsets/${execution.metaAdSetId}`, accessToken);
          cleaned.adset = true;
          this.logger.log(`Removido AdSet ${execution.metaAdSetId}`);
        } catch (e) {
          this.logger.warn(`Falha ao remover AdSet ${execution.metaAdSetId}: ${(e as Error).message}`);
        }
      }

      if (execution.metaCampaignId) {
        try {
          await this.deleteMetaResource(`${accountPath}/campaigns/${execution.metaCampaignId}`, accessToken);
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
  async getExecutionStatus(executionId: string) {
    const execution = await this.campaignCreationRepository.findOne({
      where: { id: executionId },
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
          this.logger.log(`Step ${step} completado ao resumir`);
        },
      });

      Object.assign(createdIds, resumedIds);

      execution.status = MetaCampaignCreationStatus.ACTIVE;
      execution.metaCampaignId = createdIds.campaignId;
      execution.metaAdSetId = createdIds.adSetId;
      execution.metaCreativeId = createdIds.creativeId;
      execution.metaAdId = createdIds.adId;
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
}
