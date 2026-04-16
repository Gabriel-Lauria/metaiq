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
      min-height: 24px;
      padding: 3px 9px;
      border: 1px solid rgba(100, 116, 139, 0.3);
      border-radius: 8px;
      background: rgba(100, 116, 139, 0.16);
      color: #cbd5e1;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .tone-success {
      border-color: rgba(52, 211, 153, 0.28);
      background: rgba(52, 211, 153, 0.12);
      color: #52e0aa;
    }

    .tone-warning {
      border-color: rgba(251, 191, 36, 0.28);
      background: rgba(251, 191, 36, 0.12);
      color: #fcd34d;
    }

    .tone-danger {
      border-color: rgba(252, 129, 129, 0.28);
      background: rgba(252, 129, 129, 0.12);
      color: #fc8181;
    }

    .tone-info {
      border-color: rgba(110, 231, 247, 0.28);
      background: rgba(110, 231, 247, 0.12);
      color: #6ee7f7;
    }
  `]
})
export class UiBadgeComponent {
  @Input() label = '';
  @Input() tone: BadgeTone = 'neutral';
}
