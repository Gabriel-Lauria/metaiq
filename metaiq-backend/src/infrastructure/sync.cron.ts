import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CampaignsService } from '../modules/campaigns/campaigns.service';
import { InsightsService } from '../modules/insights/insights.service';
import { LoggerService } from '../common/services/logger.service';

/**
 * SyncCron executa tarefas de sincronização em background.
 *
 * CRON JOBS DEFINIDOS:
 * - generateInsights: todo início de hora — gera insights para campanhas ativas
 *
 * PRINCÍPIO DE DESIGN:
 * - Cada campanha é processada individualmente com try/catch
 * - Falha em uma campanha NÃO interrompe o processamento das demais
 * - Todos os erros são logados para diagnóstico
 *
 * PRÓXIMOS PASSOS:
 * - syncMetaData: buscar dados reais da Meta API e popular MetricDaily
 * - sendAlertEmails: enviar email quando novos insights 'danger' são gerados
 * - cleanOldInsights: arquivar insights resolvidos há mais de 30 dias
 */
@Injectable()
export class SyncCron {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly insightsService: InsightsService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Executa a cada hora: gera insights para todas as campanhas ativas
   *
   * Schedule: 0 0 * * * * = minute 0 of every hour
   */
  @Cron('0 0 * * * *')
  async generateInsights() {
    const operation = this.logger.startOperation('Cron: Geração de insights');
    
    try {
      const campaigns = await this.campaignsService.findAllActiveForSystemJob();
      let success = 0;
      let errors = 0;

      for (const campaign of campaigns) {
        try {
          await this.insightsService.generateForCampaign(campaign);
          success++;
        } catch (err) {
          errors++;
          this.logger.error(
            `Erro ao gerar insights para campanha ${campaign.id}`,
            err,
            { campaignId: campaign.id },
          );
        }
      }

      this.logger.info(
        `Cron finalizado: ${success} sucessos, ${errors} erros de ${campaigns.length} campanhas`,
        { success, errors, total: campaigns.length },
      );

      operation.end(errors === 0, { success, errors, total: campaigns.length });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error('Erro geral no cron de insights', err);
      operation.end(false, { error: errorMessage });
    }
  }

  @Cron('0 0 2 * * *')
  async cleanOldResolvedInsights() {
    const operation = this.logger.startOperation('Cron: Limpeza de insights antigos');
    
    try {
      await this.insightsService.deleteOldResolved(30);
      this.logger.info('Limpeza de insights antigos concluída');
      operation.end(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error('Erro ao limpar insights antigos', err);
      operation.end(false, { error: errorMessage });
    }
  }

}
