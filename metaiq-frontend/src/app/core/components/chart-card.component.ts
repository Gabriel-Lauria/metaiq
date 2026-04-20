import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-chart-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article class="chart-card">
      <div class="chart-card-header">
        <div>
          <span class="eyebrow">{{ category }}</span>
          <h3>{{ title }}</h3>
        </div>
        <span *ngIf="subtitle" class="chart-card-subtitle">{{ subtitle }}</span>
      </div>
      <div class="chart-card-body">
        <ng-content></ng-content>
      </div>
    </article>
  `,
  styles: [`
    .chart-card {
      display: grid;
      gap: 18px;
      padding: 24px;
      border-radius: 24px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
    }

    .chart-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
    }

    .eyebrow {
      display: block;
      margin-bottom: 8px;
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.14em;
    }

    h3 {
      margin: 0;
      color: var(--text);
      font-size: 18px;
      font-weight: 700;
    }

    .chart-card-subtitle {
      color: var(--text-muted);
      font-size: 13px;
      white-space: nowrap;
    }

    .chart-card-body {
      min-height: 320px;
    }

    @media (max-width: 768px) {
      .chart-card {
        padding: 20px;
      }

      .chart-card-body {
        min-height: 260px;
      }
    }
  `]
})
export class ChartCardComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() category = 'Analítico';
}
