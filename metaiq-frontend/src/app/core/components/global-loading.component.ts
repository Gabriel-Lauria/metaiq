import { Component, inject } from '@angular/core';
import { UiService } from '../services/ui.service';

@Component({
  selector: 'app-global-loading',
  standalone: true,
  imports: [],
  template: `
    @if (uiService.globalLoading()) {
      <div class="global-loading-overlay">
        <div class="global-loading-content">
          <div class="spinner"></div>
          <div class="loading-text">Carregando...</div>
        </div>
      </div>
    }
  `,
  styles: [`
    .global-loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(2px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .global-loading-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 32px;
      background: rgba(15, 19, 32, 0.96);
      border: 1px solid rgba(110, 231, 247, 0.16);
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid rgba(110, 231, 247, 0.14);
      border-top: 4px solid #6ee7f7;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    .loading-text {
      color: #94a3b8;
      font-size: 14px;
      font-weight: 500;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    @media (max-width: 480px) {
      .global-loading-content {
        padding: 24px;
        margin: 16px;
      }

      .spinner {
        width: 32px;
        height: 32px;
        border-width: 3px;
      }
    }
  `]
})
export class GlobalLoadingComponent {
  uiService = inject(UiService);
}
