import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiService, Notification } from '../services/ui.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-notification-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="notification-container">
      @for (notification of uiService.notifications(); track notification.id) {
        <div
          class="notification"
          [ngClass]="notification.type"
          (click)="onNotificationClick(notification)"
        >
          <div class="notification-content">
            <div class="notification-title">{{ notification.title }}</div>
            <div class="notification-message">{{ notification.message }}</div>
            @if (notification.action) {
              <button
                class="notification-action"
                (click)="notification.action.callback(); remove(notification.id)"
              >
                {{ notification.action.label }}
              </button>
            }
          </div>
          <button
            class="notification-close"
            (click)="remove(notification.id)"
            aria-label="Fechar notificação"
          >
            ×
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .notification-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      max-width: 400px;
      pointer-events: none;
    }

    .notification {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      margin-bottom: 8px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      pointer-events: auto;
      animation: slideIn 0.3s ease-out;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .notification:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }

    .notification.success {
      background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%);
      border-left: 4px solid #28a745;
      color: #155724;
    }

    .notification.error {
      background: linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%);
      border-left: 4px solid #dc3545;
      color: #721c24;
    }

    .notification.warning {
      background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%);
      border-left: 4px solid #ffc107;
      color: #856404;
    }

    .notification.info {
      background: linear-gradient(135deg, #d1ecf1 0%, #bee5eb 100%);
      border-left: 4px solid #17a2b8;
      color: #0c5460;
    }

    .notification-content {
      flex: 1;
    }

    .notification-title {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 4px;
    }

    .notification-message {
      font-size: 13px;
      line-height: 1.4;
    }

    .notification-action {
      margin-top: 8px;
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 4px;
      color: inherit;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .notification-action:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .notification-close {
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: inherit;
      opacity: 0.7;
      padding: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .notification-close:hover {
      opacity: 1;
    }

    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @media (max-width: 480px) {
      .notification-container {
        left: 20px;
        right: 20px;
        max-width: none;
      }
    }
  `]
})
export class NotificationContainerComponent implements OnInit, OnDestroy {
  uiService = inject(UiService);
  private subscription?: Subscription;

  ngOnInit(): void {
    // Component is reactive via signals
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  remove(id: string): void {
    this.uiService.removeNotification(id);
  }

  onNotificationClick(notification: Notification): void {
    // Auto remove on click if no action
    if (!notification.action) {
      this.remove(notification.id);
    }
  }
}