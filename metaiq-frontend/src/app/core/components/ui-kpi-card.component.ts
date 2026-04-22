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
  styles: [
    `
      .kpi-card {
        display: grid;
        gap: 14px;
        min-width: 0;
        min-height: 150px;
        padding: 22px;
        border-radius: 8px;
        background: var(--bg-surface);
        border: 1px solid var(--border);
        box-shadow: var(--shadow);
        overflow: hidden;
      }

      .kpi-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
      }

      .kpi-label {
        min-width: 0;
        color: var(--text-muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        overflow-wrap: anywhere;
      }

      .kpi-marker {
        display: grid;
        place-items: center;
        min-width: 32px;
        min-height: 32px;
        border-radius: 12px;
        background: rgba(37, 99, 235, 0.12);
        color: var(--primary);
        font-size: 13px;
        font-weight: 800;
      }

      .kpi-value {
        min-width: 0;
        color: var(--text);
        font-family: var(--font-mono);
        font-size: clamp(22px, 2.3vw, 32px);
        line-height: 1.05;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      .kpi-hint {
        color: var(--text-muted);
        font-size: 13px;
        line-height: 1.6;
      }

      .tone-success .kpi-marker {
        background: rgba(22, 163, 74, 0.12);
        color: var(--success);
      }

      .tone-warning .kpi-marker {
        background: rgba(245, 158, 11, 0.14);
        color: var(--warning);
      }

      .tone-danger .kpi-marker {
        background: rgba(220, 38, 38, 0.14);
        color: var(--danger);
      }

      .tone-info .kpi-marker {
        background: rgba(37, 99, 235, 0.16);
        color: var(--primary);
      }

      @media (max-width: 767px) {
        .kpi-card {
          min-height: 130px;
          padding: 18px;
        }

        .kpi-value {
          font-size: 26px;
        }
      }
    `
  ]
})
export class UiKpiCardComponent {
  @Input() label = '';
  @Input() value: string | number = '';
  @Input() hint = '';
  @Input() marker = '';
  @Input() tone: KpiTone = 'default';
}
