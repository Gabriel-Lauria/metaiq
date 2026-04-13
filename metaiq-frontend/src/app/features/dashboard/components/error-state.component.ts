import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-error-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="error-container">
      <div class="error-content">
        <div class="error-icon">⚠️</div>
        <h3 class="error-title">{{ title }}</h3>
        <p class="error-message">{{ message }}</p>
        <button class="retry-btn" (click)="onRetry()" *ngIf="showRetry">
          <span>↻</span> Tentar novamente
        </button>
      </div>
    </div>
  `,
  styles: [`
    .error-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 300px;
      padding: 40px;
    }

    .error-content {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      max-width: 400px;
    }

    .error-icon {
      font-size: 48px;
      opacity: 0.8;
    }

    .error-title {
      font-size: 16px;
      font-weight: 600;
      color: #fc8181;
      margin: 0;
    }

    .error-message {
      font-size: 13px;
      color: #c8d3e8;
      margin: 0;
      line-height: 1.5;
    }

    .retry-btn {
      margin-top: 12px;
      padding: 8px 16px;
      background: linear-gradient(135deg, #6ee7f7 0%, #34d399 100%);
      color: #0f1320;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 6px;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(110, 231, 247, 0.3);
      }

      &:active {
        transform: translateY(0);
      }

      span {
        font-size: 14px;
      }
    }
  `]
})
export class ErrorStateComponent {
  @Input() title = 'Erro ao carregar dados';
  @Input() message = 'Ocorreu um problema. Por favor, tente novamente.';
  @Input() showRetry = true;
  @Output() retry = new EventEmitter<void>();

  onRetry(): void {
    this.retry.emit();
  }
}
