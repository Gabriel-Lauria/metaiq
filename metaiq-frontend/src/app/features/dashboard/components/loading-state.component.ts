import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loading-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="loading-container">
      <div class="loading-content">
        <div class="spinner" [class.small]="size === 'small'"></div>
        <p class="loading-text" *ngIf="message">{{ message }}</p>
        <p class="loading-subtext" *ngIf="subtext">{{ subtext }}</p>
      </div>
    </div>
  `,
  styles: [`
    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 300px;
      padding: 40px;
    }

    .loading-content {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }

    .spinner {
      width: 48px;
      height: 48px;
      border: 3px solid rgba(110, 231, 247, 0.1);
      border-top-color: #6ee7f7;
      border-radius: 50%;
      animation: spin 1s linear infinite;

      &.small {
        width: 32px;
        height: 32px;
        border-width: 2px;
      }
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .loading-text {
      font-size: 14px;
      font-weight: 500;
      color: #f0f4ff;
      margin: 0;
    }

    .loading-subtext {
      font-size: 12px;
      color: #64748b;
      margin: 0;
    }
  `]
})
export class LoadingStateComponent {
  @Input() message = 'Carregando...';
  @Input() subtext?: string;
  @Input() size: 'small' | 'normal' = 'normal';
}
