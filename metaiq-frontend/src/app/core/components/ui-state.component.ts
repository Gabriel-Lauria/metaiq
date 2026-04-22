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
      gap: 14px;
      min-height: 220px;
      padding: 40px 28px;
      text-align: center;
      border: 1px dashed rgba(37, 99, 235, 0.22);
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 10px 28px rgba(15, 23, 42, 0.05);
    }

    .ui-state h2 {
      margin: 0;
      color: #0f172a;
      font-size: 20px;
      font-weight: 800;
    }

    .ui-state p {
      margin: 0;
      max-width: 460px;
      color: #64748b;
      font-size: 14px;
      line-height: 1.7;
    }

    .state-error {
      border-style: solid;
      border-color: rgba(239, 68, 68, 0.24);
      background: #fff7f7;
    }

    .state-icon {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 14px;
      background: rgba(37, 99, 235, 0.14);
      color: #2563eb;
      font-size: 22px;
      font-weight: 700;
    }

    .state-error .state-icon {
      background: rgba(239, 68, 68, 0.16);
      color: #ef4444;
    }

    .spinner {
      width: 44px;
      height: 44px;
      border: 4px solid rgba(37, 99, 235, 0.2);
      border-top-color: #2563eb;
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
