import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-period-filter',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="period-filter">
      <div class="period-actions">
        <button type="button" class="period-action" [class.active]="selectedPeriod === 1" (click)="selectPeriod(1)">Hoje</button>
        <button type="button" class="period-action" [class.active]="selectedPeriod === 7" (click)="selectPeriod(7)">7 dias</button>
        <button type="button" class="period-action" [class.active]="selectedPeriod === 30" (click)="selectPeriod(30)">30 dias</button>
        <button type="button" class="period-action" [class.active]="selectedPeriod === 'thisMonth'" (click)="selectPeriod('thisMonth')">Este mês</button>
        <button type="button" class="period-action" [class.active]="customSelected" (click)="enableCustom()">Personalizado</button>
      </div>

      <div class="date-range">
        <label>
          Início
          <input type="date" [value]="fromDate" (change)="setDate('from', $event.target.value)" />
        </label>
        <label>
          Fim
          <input type="date" [value]="toDate" (change)="setDate('to', $event.target.value)" />
        </label>
      </div>
    </section>
  `,
  styles: [
    `
      .period-filter {
        display: grid;
        gap: 16px;
        padding: 20px;
        border-radius: 24px;
        background: var(--bg-surface);
        border: 1px solid var(--border);
        box-shadow: var(--shadow);
      }

      .period-actions {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 10px;
      }

      .period-action {
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 12px 14px;
        background: var(--bg-surface);
        color: var(--text);
        font-weight: 700;
        transition: all 0.2s ease;
      }

      .period-action.active,
      .period-action:hover {
        background: var(--accent);
        color: white;
        border-color: transparent;
      }

      .date-range {
        display: grid;
        grid-template-columns: repeat(2, minmax(160px, 1fr));
        gap: 16px;
      }

      label {
        display: grid;
        gap: 8px;
        color: var(--text-muted);
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      input {
        min-height: 48px;
        border-radius: 16px;
        border: 1px solid var(--border);
        background: #ffffff;
        color: var(--text);
        padding: 0 14px;
      }

      input:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
      }

      @media (max-width: 760px) {
        .period-actions {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .date-range {
          grid-template-columns: 1fr;
        }
      }
    `
  ]
})
export class PeriodFilterComponent {
  @Input() selectedPeriod: number | 'thisMonth' | -1 = 30;
  @Input() fromDate?: string;
  @Input() toDate?: string;
  @Output() filtersChange = new EventEmitter<Partial<{ period: number | 'thisMonth' | -1; fromDate?: string; toDate?: string }>>();

  get customSelected() {
    return this.selectedPeriod === -1;
  }

  selectPeriod(period: number | 'thisMonth' | -1) {
    this.filtersChange.emit({ period, fromDate: undefined, toDate: undefined });
  }

  enableCustom() {
    this.filtersChange.emit({ period: -1 });
  }

  setDate(type: 'from' | 'to', value: string) {
    if (type === 'from') {
      this.filtersChange.emit({ fromDate: value, toDate: this.toDate, period: -1 });
    } else {
      this.filtersChange.emit({ fromDate: this.fromDate, toDate: value, period: -1 });
    }
  }
}
