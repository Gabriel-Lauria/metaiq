import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

type UiStateType = 'loading' | 'empty' | 'error';

@Component({
  selector: 'app-ui-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="ui-state" [ngClass]="'state-' + type">
      <div class="spinner" *ngIf="type === 'loading'" aria-hidden="true"></div>
      <div class="state-icon" *ngIf="type !== 'loading'" aria-hidden="true">{{ icon }}</div>
      <h2>{{ title }}</h2>
      <p *ngIf="message">{{ message }}</p>
      <button
        *ngIf="actionLabel"
        type="button"
        class="btn btn-secondary"
        (click)="action.emit()"
      >
        {{ actionLabel }}
      </button>
    </section>
  `,
  styles: [`
    .ui-state {
      display: grid;
      justify-items: center;
      gap: 12px;
      min-height: 220px;
      padding: 40px 24px;
      text-align: center;
      border: 1px dashed rgba(110, 231, 247, 0.16);
      border-radius: 8px;
      background: rgba(15, 19, 32, 0.72);
    }

    .ui-state h2 {
      margin: 0;
      color: #f0f4ff;
      font-size: 18px;
      font-weight: 700;
    }

    .ui-state p {
      margin: 0;
      max-width: 460px;
      color: #94a3b8;
      font-size: 14px;
    }

    .state-error {
      border-style: solid;
      border-color: rgba(252, 129, 129, 0.26);
      background: rgba(252, 129, 129, 0.06);
    }

    .state-icon {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 8px;
      background: rgba(110, 231, 247, 0.1);
      color: #6ee7f7;
      font-size: 22px;
      font-weight: 700;
    }

    .state-error .state-icon {
      background: rgba(252, 129, 129, 0.12);
      color: #fc8181;
    }

    .spinner {
      width: 42px;
      height: 42px;
      border: 3px solid rgba(110, 231, 247, 0.16);
      border-top-color: #6ee7f7;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `]
})
export class UiStateComponent {
  @Input() type: UiStateType = 'empty';
  @Input() title = 'Nenhum dado encontrado';
  @Input() message = '';
  @Input() actionLabel = '';
  @Input() icon = 'i';
  @Output() action = new EventEmitter<void>();
}
