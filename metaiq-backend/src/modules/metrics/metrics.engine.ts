/**
 * Engine de cálculo de métricas
 * Calcula CTR, CPA, ROAS e score baseado em métricas brutos
 */

export interface RawMetrics {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
}

export interface ComputedMetrics extends RawMetrics {
  ctr: number;
  cpa: number;
  roas: number;
  score: number;
}

export class MetricsEngine {
  /**
   * Computa métricas derivadas a partir de valores brutos
   */
  compute(raw: RawMetrics): ComputedMetrics {
    const ctr = this.calculateCTR(raw.clicks, raw.impressions);
    const cpa = this.calculateCPA(raw.spend, raw.conversions);
    const roas = this.calculateROAS(raw.revenue, raw.spend);
    const score = this.calculateScore({ ...raw, ctr, cpa, roas } as ComputedMetrics);

    return {
      ...raw,
      ctr: this.round(ctr, 4),
      cpa: this.round(cpa, 2),
      roas: this.round(roas, 2),
      score: this.round(score, 2),
    };
  }

  /**
   * CTR = Clicks / Impressions
   */
  private calculateCTR(clicks: number, impressions: number): number {
    if (impressions === 0) return 0;
    return clicks / impressions;
  }

  /**
   * CPA = Spend / Conversions
   */
  private calculateCPA(spend: number, conversions: number): number {
    if (conversions === 0) return 0;
    return spend / conversions;
  }

  /**
   * ROAS = Revenue / Spend
   */
  private calculateROAS(revenue: number, spend: number): number {
    if (spend === 0) return 0;
    return revenue / spend;
  }

  /**
   * Score normalizado (0-100)
   * Baseado em ROAS e CTR
   */
  private calculateScore(metrics: ComputedMetrics): number {
    // ROAS contribui 60%, CTR contribui 40%
    const roasScore = Math.min(metrics.roas * 20, 60); // Max 60 pontos
    const ctrScore = Math.min(metrics.ctr * 4000, 40); // Max 40 pontos
    
    let score = roasScore + ctrScore;
    
    // Penalidade se CPA muito alto
    if (metrics.cpa > 100) {
      score *= 0.8;
    }
    
    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Arredondar para N casas decimais
   */
  private round(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }
}
