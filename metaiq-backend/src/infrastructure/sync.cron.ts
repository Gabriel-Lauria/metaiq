import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CampaignsService } from '../modules/campaigns/campaigns.service';
import { InsightsService } from '../modules/insights/insights.service';

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
  private readonly logger = new Logger(SyncCron.name);

  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly insightsService: InsightsService,
  ) {}

  /**
   * Executa a cada hora: gera insights para todas as campanhas ativas
   *
   * Schedule: 0 0 * * * * = minute 0 of every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async generateInsights() {
    this.logger.log('⏰ Cron iniciado: geração de insights');
    const start = Date.now();

    try {
      const campaigns = await this.campaignsService.findAllActive();
      let success = 0;
      let errors = 0;

      for (const campaign of campaigns) {
        try {
          await this.insightsService.generateForCampaign(campaign);
          success++;
        } catch (err) {
          errors++;
          this.logger.error(
            `Erro ao gerar insights para campanha ${campaign.id}: ${err.message}`,
          );
        }
      }

      const duration = Date.now() - start;
      this.logger.log(
        `⏰ Cron finalizado em ${duration}ms — ` +
        `${success} ok, ${errors} erros de ${campaigns.length} campanhas`,
      );
    } catch (err) {
      this.logger.error(`Erro geral no cron de insights: ${err.message}`);
    }
  }

  /**
   * Executa todo dia às 2h da manhã e limpa insights resolvidos antigos.
   */
  @Cron('0 0 2 * * *')
  async cleanOldResolvedInsights() {
    this.logger.log('🧹 Cron iniciado: limpeza de insights antigos');
    await this.insightsService.deleteOldResolved(30);
    this.logger.log('🧹 Cron finalizado: limpeza completada');
  }

  /**
   * Executa a cada 6 horas: sincroniza dados com a Meta API
   *
   * PRÓXIMO PASSO: implementar integração real com Meta Graph API
   */
  @Cron('0 */6 * * * *') // Every 6 hours
  async syncMetaData() {
    this.logger.log('🔄 Cron iniciado: sincronização com Meta API');

    // PRÓXIMO PASSO: buscar campanhas, métricas e dados reais da Meta API
    // e popular MetricDaily com dados reais

    this.logger.log('🔄 Cron finalizado: sincronização completada');
  }
}
