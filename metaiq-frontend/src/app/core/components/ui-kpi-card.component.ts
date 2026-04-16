import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

type KpiTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

@Component({
  selector: 'app-ui-kpi-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article [class]="'kpi-card tone-' + tone">
      <div class="kpi-header">
        <span class="kpi-label">{{ label }}</span>
        <span class="kpi-marker" *ngIf="marker">{{ marker }}</span>
      </div>
      <strong class="kpi-value">{{ value }}</strong>
      <span class="kpi-hint" *ngIf="hint">{{ hint }}</span>
    </article>
  `,
  styles: [`
    .kpi-card {
      display: grid;
      gap: 10px;
      min-height: 136px;
      padding: 18px;
      border: 1px solid rgba(110, 231, 247, 0.1);
      border-radius: 8px;
      background: rgba(15, 19, 32, 0.86);
      box-shadow: 0 16px 42px rgba(0, 0, 0, 0.16);
    }

    .kpi-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }

    .kpi-label {
      color: #94a3b8;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .kpi-marker {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: rgba(110, 231, 247, 0.1);
      color: #6ee7f7;
      font-size: 13px;
      font-weight: 800;
    }

    .kpi-value {
      color: #f0f4ff;
      font-family: 'Space Mono', monospace;
      font-size: 30px;
      line-height: 1.1;
      overflow-wrap: anywhere;
    }

    .kpi-hint {
      color: #64748b;
      font-size: 13px;
    }

    .tone-success .kpi-marker {
      background: rgba(52, 211, 153, 0.12);
      color: #52e0aa;
    }

    .tone-warning .kpi-marker {
      background: rgba(251, 191, 36, 0.12);
      color: #fcd34d;
    }

    .tone-danger .kpi-marker {
      background: rgba(252, 129, 129, 0.12);
      color: #fc8181;
    }

    .tone-info .kpi-marker {
      background: rgba(110, 231, 247, 0.12);
      color: #6ee7f7;
    }

    @media (max-width: 767px) {
      .kpi-card {
        min-height: 120px;
        padding: 16px;
      }

      .kpi-value {
        font-size: 26px;
      }
    }
  `]
})
export class UiKpiCardComponent {
  @Input() label = '';
  @Input() value: string | number = '';
  @Input() hint = '';
  @Input() marker = '';
  @Input() tone: KpiTone = 'default';
}
