import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { BillingAlert } from '../models/financial.models';

@Component({
  selector: 'app-insights-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="insights-panel">
      <div class="insights-header">
        <div>
          <p class="eyebrow">Insights Automáticos</p>
          <h2>O que pede atenção</h2>
        </div>
      </div>

      <div *ngIf="alerts?.length; else emptyState" class="insights-list">
        <article *ngFor="let alert of alerts" [class]="'insight-card insight-' + alert.type">
          <div class="insight-icon">{{ iconFor(alert.type) }}</div>
          <div class="insight-body">
            <h3>{{ alert.title }}</h3>
            <p>{{ alert.message }}</p>
            <span *ngIf="alert.amount" class="insight-amount">{{ formatAmount(alert.amount) }}</span>
          </div>
        </article>
      </div>

      <ng-template #emptyState>
        <div class="insight-empty">Sem alertas no período selecionado.</div>
      </ng-template>
    </section>
  `,
  styles: [`
    .insights-panel {
      display: grid;
      gap: 18px;
      padding: 24px;
      border-radius: 24px;
      background: #ffffff;
      box-shadow: var(--shadow);
    }

    .insights-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }

    .insights-header h2 {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
      color: var(--text);
    }

    .insights-list {
      display: grid;
      gap: 14px;
    }

    .insight-card {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 16px;
      padding: 18px;
      border-radius: 20px;
      border: 1px solid var(--border);
      background: #f8fafc;
    }

    .insight-icon {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      border-radius: 14px;
      background: rgba(37, 99, 235, 0.12);
      color: var(--primary);
      font-size: 18px;
    }

    .insight-body h3 {
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 700;
      color: var(--text);
    }

    .insight-body p {
      margin: 0;
      color: var(--text-muted);
      font-size: 14px;
    }

    .insight-amount {
      margin-top: 12px;
      display: inline-flex;
      color: var(--primary-dark);
      font-weight: 700;
      font-size: 14px;
    }

    .insight-warning {
      border-color: rgba(245, 158, 11, 0.22);
      background: #fffbeb;
    }

    .insight-error {
      border-color: rgba(220, 38, 38, 0.22);
      background: #fef2f2;
    }

    .insight-info {
      border-color: rgba(37, 99, 235, 0.22);
      background: #eff6ff;
    }

    .insight-success {
      border-color: rgba(22, 163, 74, 0.22);
      background: #ecfdf5;
    }

    .insight-empty {
      padding: 28px;
      border-radius: 20px;
      border: 1px solid var(--border);
      background: #ffffff;
      color: var(--text-muted);
      text-align: center;
      font-size: 14px;
    }
  `]
})
export class InsightsPanelComponent {
  @Input() alerts: BillingAlert[] = [];

  iconFor(type: BillingAlert['type']) {
    return type === 'warning' ? '⚠️' : type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  }

  formatAmount(amount: number) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(amount);
  }
}
