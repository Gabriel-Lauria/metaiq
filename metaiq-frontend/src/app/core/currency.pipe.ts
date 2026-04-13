import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formata números como moeda Brazilian Real (R$)
 * Uso: {{ 1234.56 | currency:'R$' }}
 * Resultado: R$1.234,56
 */
@Pipe({ name: 'currency', standalone: true })
export class CurrencyPipe implements PipeTransform {
  transform(value: number | null | undefined, prefix = ''): string {
    if (value == null || value === 0) return '—';
    return prefix + value.toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }
}
