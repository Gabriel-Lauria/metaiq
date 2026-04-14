import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Insight } from './insight.entity';
import { Campaign } from '../campaigns/campaign.entity';
import { MetricsService } from '../metrics/metrics.service';

/**
 * InsightsService é o coração inteligente do MetaIQ.
 *
 * Responsabilidade: analisar métricas das campanhas e gerar insights acionáveis.
 *
 * ARQUITETURA DO MOTOR DE REGRAS:
 * Cada regra é um método privado que recebe os dados e retorna um Insight parcial
 * ou null (se a regra não se aplica). Isso torna fácil:
 * - Adicionar novas regras sem tocar no código existente
 * - Testar cada regra isoladamente
 * - Desabilitar regras individualmente no futuro
 */

type InsightPayload = Pick<
  Insight,
  'type' | 'severity' | 'message' | 'recommendation'
>;

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  // Thresholds das regras — centralizados para fácil ajuste
  private readonly THRESHOLDS = {
    ROAS_DANGER: 1.0, // ROAS abaixo disso = prejuízo
    ROAS_WARNING: 2.0, // ROAS abaixo disso = margem baixa
    ROAS_OPPORTUNITY: 4.0, // ROAS acima disso = escalar campanha
    CTR_DANGER: 0.5, // CTR% abaixo disso = criativo problemático
    CTR_WARNING: 1.0, // CTR% abaixo disso = abaixo da média
    CTR_OPPORTUNITY: 3.0, // CTR% acima disso = criativo excelente
    CPA_HIGH_RATIO: 0.5, // CPA > 50% do orçamento = alerta
    CPA_LOW_RATIO: 0.2, // CPA < 20% do orçamento = oportunidade de escala
    OVERSPEND_RATIO: 1.1, // Gasto > 110% do dailyBudget = alerta
    MIN_SPEND_NO_CONV: 50, // R$50 sem conversão = alerta
    DAYS_NO_DATA: 3, // Dias sem dados = alerta de campanha inativa
    DAYS_TO_END: 3, // Dias até encerramento = aviso
    LOOKBACK_DAYS: 7, // Janela de análise das métricas
  };

  constructor(
    @InjectRepository(Insight)
    private readonly insightRepo: Repository<Insight>,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * Ponto de entrada principal: gera insights para uma campanha.
   * Chamado pelo cron job a cada hora e pelo endpoint manual.
   */
  async generateForCampaign(campaign: Campaign): Promise<Insight[]> {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(
      Date.now() - this.THRESHOLDS.LOOKBACK_DAYS * 86400000,
    )
      .toISOString()
      .split('T')[0];

    const summary = await this.metricsService.getCampaignSummary(
      campaign.id,
      from,
      to,
    );

    if (!summary) {
      return [];
    }

    const totalSpend = summary.totalSpend || 0;
    const totalConversions = summary.conversions || 0;
    const lastMetricDate = summary.lastMetricDate || null;

    const avgCTR = summary.avgCtr || summary.ctr || 0;
    const avgCPA = totalConversions > 0 ? totalSpend / totalConversions : 0;
    const avgROAS = summary.avgRoas || summary.roas || 0;

    const rules: Array<() => InsightPayload | null> = [
      () => this.ruleROASDanger(avgROAS),
      () => this.ruleROASWarning(avgROAS),
      () => this.ruleROASOpportunity(avgROAS),
      () => this.ruleCTRDanger(avgCTR),
      () => this.ruleCTRWarning(avgCTR),
      () => this.ruleCTROpportunity(avgCTR),
      () => this.ruleCPAHigh(avgCPA, campaign.dailyBudget),
      () => this.ruleCPALow(avgCPA, campaign.dailyBudget),
      () => this.ruleOverspend(totalSpend, campaign.dailyBudget),
      () => this.ruleNoConversions(totalSpend, totalConversions),
      () => this.ruleCampaignEndingSoon(campaign.endTime),
      () => this.ruleNoRecentData(lastMetricDate),
    ];

    const newInsights: Insight[] = [];

    for (const rule of rules) {
      const payload = rule();
      if (!payload) continue;

      // Verifica duplicata com cooldown
      const duplicate = await this.insightRepo.findOne({
        where: {
          campaignId: campaign.id,
          type: payload.type,
          severity: payload.severity,
          resolved: false,
        },
      });

      // Se houver duplicata e dentro do cooldown, pula
      if (duplicate && this.isInCooldown(duplicate)) {
        continue;
      }

      // Se houver duplicata fora do cooldown, atualiza lastTriggeredAt
      if (duplicate) {
        duplicate.lastTriggeredAt = new Date();
        duplicate.cooldownInHours = this.getCooldownForRule(payload.type);
        duplicate.priority = this.getPriorityForRule(payload.severity);
        duplicate.ruleVersion = 1;
        await this.insightRepo.save(duplicate);
        continue;
      }

      const insight = this.insightRepo.create({
        campaignId: campaign.id,
        ...payload,
        resolved: false,
        priority: this.getPriorityForRule(payload.severity),
        cooldownInHours: this.getCooldownForRule(payload.type),
        lastTriggeredAt: new Date(),
        ruleVersion: 1,
      });

      newInsights.push(await this.insightRepo.save(insight));
    }

    if (newInsights.length > 0) {
      this.logger.log(
        `${newInsights.length} novos insights gerados para campanha ${campaign.id}`,
      );
    }

    return newInsights;
  }

  async resolveInsight(id: string): Promise<Insight> {
    const insight = await this.insightRepo.findOneOrFail({ where: { id } });
    insight.resolved = true;
    return this.insightRepo.save(insight);
  }

  /**
   * Resolve insight com validação de ownership
   */
  async resolveInsightByUser(id: string, userId: string): Promise<Insight> {
    const insight = await this.insightRepo
      .createQueryBuilder('insight')
      .innerJoinAndSelect('insight.campaign', 'campaign')
      .where('insight.id = :id', { id })
      .andWhere('campaign.userId = :userId', { userId })
      .getOne();

    if (!insight) {
      throw new NotFoundException(`Insight ${id} não encontrado`);
    }

    insight.resolved = true;
    return this.insightRepo.save(insight);
  }

  async findOne(id: string): Promise<Insight> {
    return this.insightRepo.findOneOrFail({ where: { id } });
  }

  /**
   * Find insight com validação de ownership
   */
  async findOneByUser(id: string, userId: string): Promise<Insight> {
    const insight = await this.insightRepo
      .createQueryBuilder('insight')
      .innerJoinAndSelect('insight.campaign', 'campaign')
      .where('insight.id = :id', { id })
      .andWhere('campaign.userId = :userId', { userId })
      .getOne();

    if (!insight) {
      throw new NotFoundException(`Insight ${id} não encontrado`);
    }

    return insight;
  }

  async deleteOldResolved(days: number): Promise<void> {
    const cutoffDate = new Date(Date.now() - days * 86400000)
      .toISOString()
      .split('T')[0];

    await this.insightRepo.createQueryBuilder()
      .delete()
      .from(Insight)
      .where('resolved = :resolved', { resolved: true })
      .andWhere('updatedAt < :cutoffDate', { cutoffDate })
      .execute();
  }

  async findAll(filters: {
    campaignId?: string;
    type?: string;
    severity?: string;
    resolved?: boolean;
  }): Promise<Insight[]> {
    const query = this.insightRepo.createQueryBuilder('insight');

    if (filters.campaignId) {
      query.andWhere('insight.campaignId = :campaignId', {
        campaignId: filters.campaignId,
      });
    }

    if (filters.type) {
      query.andWhere('insight.type = :type', { type: filters.type });
    }

    if (filters.severity) {
      query.andWhere('insight.severity = :severity', {
        severity: filters.severity,
      });
    }

    if (filters.resolved !== undefined) {
      query.andWhere('insight.resolved = :resolved', {
        resolved: filters.resolved,
      });
    }

    query.orderBy('insight.detectedAt', 'DESC');

    return query.getMany();
  }

  /**
   * Find all insights para um usuário específico
   * SEGURANÇA: usa JOIN com Campaign para validar ownership
   */
  async findAllByUser(
    userId: string,
    filters: {
      campaignId?: string;
      type?: string;
      severity?: string;
      resolved?: boolean;
    } = {},
  ): Promise<Insight[]> {
    const query = this.insightRepo
      .createQueryBuilder('insight')
      .innerJoinAndSelect('insight.campaign', 'campaign')
      .where('campaign.userId = :userId', { userId });

    if (filters.campaignId) {
      query.andWhere('insight.campaignId = :campaignId', {
        campaignId: filters.campaignId,
      });
    }

    if (filters.type) {
      query.andWhere('insight.type = :type', { type: filters.type });
    }

    if (filters.severity) {
      query.andWhere('insight.severity = :severity', {
        severity: filters.severity,
      });
    }

    if (filters.resolved !== undefined) {
      query.andWhere('insight.resolved = :resolved', {
        resolved: filters.resolved,
      });
    }

    query.orderBy('insight.detectedAt', 'DESC');

    return query.getMany();
  }

  // ══════════════════════════════════════════════════════════════
  // REGRAS DE NEGÓCIO — cada método retorna InsightPayload ou null
  // ══════════════════════════════════════════════════════════════

  /**
   * Verifica se um insight está em período de cooldown
   */
  private isInCooldown(insight: Insight): boolean {
    if (!insight.lastTriggeredAt || !insight.cooldownInHours) {
      return false;
    }

    const lastTriggered = new Date(insight.lastTriggeredAt).getTime();
    const cooldownMs = insight.cooldownInHours * 3600000; // converter para ms
    const now = Date.now();

    return (now - lastTriggered) < cooldownMs;
  }

  /**
   * Retorna o cooldown em horas baseado no tipo de insight
   */
  private getCooldownForRule(type: string): number {
    const cooldownMap: { [key: string]: number } = {
      'alert': 4, // 4 hours
      'warning': 6, // 6 hours
      'opportunity': 24, // 24 hours
      'info': 12, // 12 hours
    };

    return cooldownMap[type] || 6;
  }

  /**
   * Retorna a prioridade baseada na severidade
   */
  private getPriorityForRule(severity: string): 'low' | 'medium' | 'high' {
    const priorityMap: { [key: string]: 'low' | 'medium' | 'high' } = {
      'danger': 'high',
      'warning': 'medium',
      'success': 'low',
      'info': 'low',
    };

    return priorityMap[severity] || 'medium';
  }

  /** Regra 1: ROAS abaixo de 1.0 (prejuízo) */
  private ruleROASDanger(roas: number): InsightPayload | null {
    if (roas === 0 || roas >= this.THRESHOLDS.ROAS_DANGER) return null;
    return {
      type: 'alert',
      severity: 'danger',
      message: `🚨 ROAS de ${roas.toFixed(2)}x: você está perdendo dinheiro nesta campanha`,
      recommendation:
        'Pause a campanha imediatamente e revise: criativo, audiência, landing page e pixel de conversão',
    };
  }

  /** Regra 2: ROAS entre 1.0 e 2.0 (margem baixa) */
  private ruleROASWarning(roas: number): InsightPayload | null {
    if (
      roas < this.THRESHOLDS.ROAS_DANGER ||
      roas >= this.THRESHOLDS.ROAS_WARNING
    )
      return null;
    return {
      type: 'alert',
      severity: 'warning',
      message: `⚠️ ROAS de ${roas.toFixed(2)}x: campanha lucrativa mas com margem baixa`,
      recommendation:
        'Otimize criativos e segmentação para melhorar o ROAS antes de escalar investimento',
    };
  }

  /** Regra 3: ROAS acima de 4.0 (excelente) */
  private ruleROASOpportunity(roas: number): InsightPayload | null {
    if (roas < this.THRESHOLDS.ROAS_OPPORTUNITY) return null;
    return {
      type: 'opportunity',
      severity: 'success',
      message: `✨ ROAS de ${roas.toFixed(2)}x: campanha com excelente retorno!`,
      recommendation:
        'Considere aumentar o orçamento em 20-30% para escalar os resultados',
    };
  }

  /** Regra 4: CTR abaixo de 0.5% (criativo ruim) */
  private ruleCTRDanger(ctr: number): InsightPayload | null {
    if (ctr === 0 || ctr >= this.THRESHOLDS.CTR_DANGER) return null;
    return {
      type: 'alert',
      severity: 'danger',
      message: `🚨 CTR de ${ctr.toFixed(2)}%: o criativo não está engajando ninguém`,
      recommendation:
        'Substitua o criativo IMEDIATAMENTE. Teste novas imagens, vídeos ou textos com emoção e urgência',
    };
  }

  /** Regra 5: CTR entre 0.5% e 1.0% (abaixo da média) */
  private ruleCTRWarning(ctr: number): InsightPayload | null {
    if (
      ctr < this.THRESHOLDS.CTR_DANGER ||
      ctr >= this.THRESHOLDS.CTR_WARNING
    )
      return null;
    return {
      type: 'alert',
      severity: 'warning',
      message: `⚠️ CTR de ${ctr.toFixed(2)}%: abaixo da média do setor (1-2%)`,
      recommendation:
        'A/B test variações do criativo: mude headlines, images, copy, CTA',
    };
  }

  /** Regra 6: CTR acima de 3.0% (excelente) */
  private ruleCTROpportunity(ctr: number): InsightPayload | null {
    if (ctr < this.THRESHOLDS.CTR_OPPORTUNITY) return null;
    return {
      type: 'opportunity',
      severity: 'success',
      message: `✨ CTR de ${ctr.toFixed(2)}%: criativo performando acima da média`,
      recommendation:
        'Use este criativo como base para novas variações. Aumente o alcance e budget incrementalmente',
    };
  }

  /** Regra 7: CPA muito alto (>50% do orçamento) */
  private ruleCPAHigh(cpa: number, dailyBudget: number): InsightPayload | null {
    if (!dailyBudget || cpa < dailyBudget * this.THRESHOLDS.CPA_HIGH_RATIO)
      return null;
    return {
      type: 'alert',
      severity: 'warning',
      message: `⚠️ CPA alto: custo por conversão (R$${cpa.toFixed(2)}) consome mais de 50% do orçamento diário`,
      recommendation:
        'Revise o funil de conversão, otimize landing page, melhore copy e sincronize pixels de evento',
    };
  }

  /** Regra 8: CPA eficiente (<20% do orçamento) */
  private ruleCPALow(cpa: number, dailyBudget: number): InsightPayload | null {
    if (
      !dailyBudget ||
      cpa === 0 ||
      cpa > dailyBudget * this.THRESHOLDS.CPA_LOW_RATIO
    )
      return null;
    return {
      type: 'opportunity',
      severity: 'success',
      message: `💰 CPA eficiente: R$${cpa.toFixed(2)} por conversão (${((cpa / dailyBudget) * 100).toFixed(0)}% do orçamento)`,
      recommendation:
        'CPA saudável — seguro para escalar. Aumente o orçamento em 20% e monitore',
    };
  }

  /** Regra 9: Gasto acima do orçamento diário */
  private ruleOverspend(totalSpend: number, dailyBudget: number): InsightPayload | null {
    if (!dailyBudget || totalSpend <= dailyBudget * this.THRESHOLDS.OVERSPEND_RATIO)
      return null;
    return {
      type: 'alert',
      severity: 'warning',
      message: `⚠️ Overspend: R$${totalSpend.toFixed(2)} gasto vs R$${dailyBudget.toFixed(2)}/dia permitido`,
      recommendation:
        'Verifique: há duplicação de campanhas? Budget foi aumentado manualmente na Meta? Reduza o budget',
    };
  }

  /** Regra 10: Gasto sem conversões */
  private ruleNoConversions(
    spend: number,
    conversions: number,
  ): InsightPayload | null {
    if (spend < this.THRESHOLDS.MIN_SPEND_NO_CONV || conversions > 0)
      return null;
    return {
      type: 'alert',
      severity: 'danger',
      message: `🚨 Gasto sem resultado: R$${spend.toFixed(2)} investidos sem nenhuma conversão em 7 dias`,
      recommendation:
        'PAUSE a campanha. Diagnostique: landing page quebrada? Pixel não dispara? Oferecimento ruim?',
    };
  }

  /** Regra 11: Campanha encerrando em breve */
  private ruleCampaignEndingSoon(
    endDate: Date | null | undefined,
  ): InsightPayload | null {
    if (!endDate) return null;

    const daysLeft = Math.ceil(
      (new Date(endDate).getTime() - Date.now()) / 86400000,
    );

    if (daysLeft > this.THRESHOLDS.DAYS_TO_END || daysLeft < 0) return null;

    return {
      type: 'info',
      severity: 'info',
      message: `ℹ️ Campanha encerrando em ${daysLeft} dia(s) (${new Date(endDate).toLocaleDateString('pt-BR')})`,
      recommendation:
        'Decida: prorrogar ou encerrar? Salve os criativos que performaram bem para futuras campanhas',
    };
  }

  /** Regra 12: Sem dados recentes (campanha inativa?) */
  private ruleNoRecentData(lastMetricDate: string | null): InsightPayload | null {
    if (!lastMetricDate) {
      return {
        type: 'info',
        severity: 'warning',
        message: `⚠️ Sem dados de performance registrados para esta campanha nos últimos ${this.THRESHOLDS.LOOKBACK_DAYS} dias`,
        recommendation:
          'Verifique se a campanha está ativa e se o pixel está disparando corretamente',
      };
    }

    const lastDate = new Date(lastMetricDate);
    const daysSince = Math.floor(
      (Date.now() - lastDate.getTime()) / 86400000,
    );

    if (daysSince < this.THRESHOLDS.DAYS_NO_DATA) return null;

    return {
      type: 'info',
      severity: 'warning',
      message: `⚠️ Sem dados há ${daysSince} dias: campanha parada ou offline`,
      recommendation:
        'Verifique: campanha foi pausada? Pixel parou de disparar? Revise status na Meta Ads',
    };
  }
}
