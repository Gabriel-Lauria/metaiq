import { Component, Input } from '@angular/core';

type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

@Component({
  selector: 'app-ui-badge',
  standalone: true,
  template: `<span [class]="'ui-badge tone-' + tone">{{ label }}</span>`,
  styles: [`
    .ui-badge {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      min-height: 28px;
      padding: 6px 12px;
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.05);
      color: #cbd5e1;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .tone-success {
      border-color: rgba(34, 197, 94, 0.28);
      background: rgba(34, 197, 94, 0.12);
      color: #22c55e;
    }

    .tone-warning {
      border-color: rgba(249, 115, 22, 0.28);
      background: rgba(249, 115, 22, 0.12);
      color: #f97316;
    }

    .tone-danger {
      border-color: rgba(239, 68, 68, 0.28);
      background: rgba(239, 68, 68, 0.12);
      color: #ef4444;
    }

    .tone-info {
      border-color: rgba(37, 99, 235, 0.28);
      background: rgba(37, 99, 235, 0.12);
      color: #2563eb;
    }

    .tone-neutral {
      border-color: rgba(148, 163, 184, 0.22);
      background: rgba(148, 163, 184, 0.08);
      color: #cbd5e1;
    }
  `]
})
export class UiBadgeComponent {
  @Input() label = '';
  @Input() tone: BadgeTone = 'neutral';
}
