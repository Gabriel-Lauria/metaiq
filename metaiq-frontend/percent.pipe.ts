import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formata números como percentual
 * Uso: {{ 0.1234 | percent }}
 * Resultado: 12,34%
 */
@Pipe({ name: 'percent', standalone: true })
export class PercentPipe implements PipeTransform {
  transform(value: number | null | undefined, decimals = 2): string {
    if (value == null) return '—';
    return (value * 100).toFixed(decimals) + '%';
  }
}
