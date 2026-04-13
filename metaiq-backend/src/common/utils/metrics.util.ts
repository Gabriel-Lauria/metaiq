/**
 * metrics.util.ts — Utilitários para cálculo de métricas de marketing digital.
 *
 * Regra de ouro: NUNCA dividir por zero.
 * Todos os cálculos usam safeDiv() que retorna 0 quando denominador = 0.
 *
 * Fórmulas padrão da indústria:
 * - CTR  = (Cliques / Impressões) × 100         — taxa de clique em %
 * - CPC  = Gasto / Cliques                       — custo por clique
 * - CPA  = Gasto / Conversões                    — custo por aquisição
 * - ROAS = Receita / Gasto                       — retorno sobre gasto em ads
 */

/** Divisão segura: retorna 0 se denominador for zero ou nulo */
export function safeDiv(numerator: number, denominator: number): number {
  if (!denominator || denominator === 0) return 0;
  return numerator / denominator;
}

/** CTR em porcentagem (ex: 0.025 → 2.5%) */
export function calcCTR(clicks: number, impressions: number): number {
  return safeDiv(clicks, impressions) * 100;
}

/** CPC em reais/dólares */
export function calcCPC(spend: number, clicks: number): number {
  return safeDiv(spend, clicks);
}

/** CPA em reais/dólares */
export function calcCPA(spend: number, conversions: number): number {
  return safeDiv(spend, conversions);
}

/** ROAS como multiplicador (ex: 3.5 = R$3,50 de receita por R$1 gasto) */
export function calcROAS(revenue: number, spend: number): number {
  return safeDiv(revenue, spend);
}

/** Margem de lucro em porcentagem (ex: 66.67 = 2/3 de lucro) */
export function calcMargin(revenue: number, spend: number): number {
  const profit = revenue - spend;
  return safeDiv(profit, revenue) * 100;
}

/** Retorna score de 0-100 baseado em ROAS (para ranking de campanhas) */
export function scoreFromROAS(roas: number): number {
  // Fórmula: transforma ROAS em score 0-100
  // ROAS 0→0, ROAS 3→100, ROAS 5→100 (platô)
  if (roas <= 0) return 0;
  if (roas >= 3) return 100;
  return (roas / 3) * 100;
}

/**
 * Calcula ROAS médio ponderado de um conjunto de métricas diárias.
 *
 * POR QUÊ média ponderada e não média simples?
 * Exemplo: dia1 (gasto R$10, ROAS 5.0) e dia2 (gasto R$1000, ROAS 1.1)
 * - Média simples: (5.0 + 1.1) / 2 = 3.05 → ERRADO, distorce a realidade
 * - Média ponderada: totalReceita / totalGasto = correto
 */
export function calcWeightedROAS(
  metrics: Array<{ spend: number; revenue: number }>,
): number {
  const totalSpend = metrics.reduce((acc, m) => acc + (m.spend || 0), 0);
  const totalRevenue = metrics.reduce((acc, m) => acc + (m.revenue || 0), 0);
  return safeDiv(totalRevenue, totalSpend);
}

/**
 * Calcula CPA médio ponderado
 */
export function calcWeightedCPA(
  metrics: Array<{ spend: number; conversions: number }>,
): number {
  const totalSpend = metrics.reduce((acc, m) => acc + (m.spend || 0), 0);
  const totalConversions = metrics.reduce((acc, m) => acc + (m.conversions || 0), 0);
  return safeDiv(totalSpend, totalConversions);
}

/**
 * Calcula CTR médio ponderado
 */
export function calcWeightedCTR(
  metrics: Array<{ clicks: number; impressions: number }>,
): number {
  const totalClicks = metrics.reduce((acc, m) => acc + (m.clicks || 0), 0);
  const totalImpressions = metrics.reduce((acc, m) => acc + (m.impressions || 0), 0);
  return calcCTR(totalClicks, totalImpressions);
}

/**
 * Calcula CPC médio ponderado
 */
export function calcWeightedCPC(
  metrics: Array<{ spend: number; clicks: number }>,
): number {
  const totalSpend = metrics.reduce((acc, m) => acc + (m.spend || 0), 0);
  const totalClicks = metrics.reduce((acc, m) => acc + (m.clicks || 0), 0);
  return calcCPC(totalSpend, totalClicks);
}

/**
 * Calcula múltiplas métricas derivadas de uma entrada de dados brutos
 * Útil para evitar recalcular tudo no service
 */
export function enrichMetrics(data: {
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  revenue: number;
}): {
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  margin: number;
  score: number;
} {
  const ctr = calcCTR(data.clicks, data.impressions);
  const cpc = calcCPC(data.spend, data.clicks);
  const cpa = calcCPA(data.spend, data.conversions);
  const roas = calcROAS(data.revenue, data.spend);
  const margin = calcMargin(data.revenue, data.spend);
  const score = scoreFromROAS(roas);

  return { ctr, cpc, cpa, roas, margin, score };
}
