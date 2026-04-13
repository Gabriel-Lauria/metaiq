/**
 * Utilitários de formatação compartilhados
 */

export class FormatUtils {
  /**
   * Formata número como moeda
   * @param value Valor numérico
   * @param prefix Prefixo (ex: 'R$')
   * @returns String formatada ou '—' se nulo/zero
   */
  static currency(value: number | null | undefined, prefix = ''): string {
    if (value == null || value === 0) return '—';
    return prefix + value.toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  /**
   * Formata número como percentual
   * @param value Valor decimal (0.1 = 10%)
   * @param decimals Casas decimais
   * @returns String formatada ou '—' se nulo
   */
  static percent(value: number | null | undefined, decimals = 2): string {
    if (value == null) return '—';
    return (value * 100).toFixed(decimals) + '%';
  }

  /**
   * Formata número genérico
   * @param value Valor numérico
   * @returns String formatada ou '—' se nulo
   */
  static number(value: number | null | undefined): string {
    if (value == null) return '—';
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  /**
   * Retorna cor baseada no score (0-100)
   */
  static scoreColor(score: number): string {
    if (score >= 80) return '#34d399'; // Verde
    if (score >= 50) return '#fbbf24'; // Amarelo
    return '#f87171'; // Vermelho
  }

  /**
   * Obtém classe CSS baseada no score
   */
  static scoreClass(score: number): string {
    if (score >= 80) return 'score-good';
    if (score >= 50) return 'score-fair';
    return 'score-poor';
  }
}
