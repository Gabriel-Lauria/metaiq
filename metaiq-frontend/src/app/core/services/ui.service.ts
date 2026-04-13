import { Injectable, signal } from '@angular/core';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  action?: {
    label: string;
    callback: () => void;
  };
}

@Injectable({
  providedIn: 'root'
})
export class UiService {
  // Global loading state
  globalLoading = signal(false);

  // Notifications
  notifications = signal<Notification[]>([]);

  // Rate limit state
  isRateLimited = signal(false);
  rateLimitReset = signal<Date | null>(null);

  showNotification(notification: Omit<Notification, 'id'>): string {
    const id = crypto.randomUUID();
    const fullNotification: Notification = {
      id,
      duration: 5000,
      ...notification
    };

    this.notifications.update(notifications => [...notifications, fullNotification]);

    // Auto remove after duration
    if (fullNotification.duration && fullNotification.duration > 0) {
      setTimeout(() => {
        this.removeNotification(id);
      }, fullNotification.duration);
    }

    return id;
  }

  removeNotification(id: string): void {
    this.notifications.update(notifications =>
      notifications.filter(n => n.id !== id)
    );
  }

  showSuccess(title: string, message: string, duration = 5000): string {
    return this.showNotification({
      type: 'success',
      title,
      message,
      duration
    });
  }

  showError(title: string, message: string, duration = 7000): string {
    return this.showNotification({
      type: 'error',
      title,
      message,
      duration
    });
  }

  showWarning(title: string, message: string, duration = 6000): string {
    return this.showNotification({
      type: 'warning',
      title,
      message,
      duration
    });
  }

  showInfo(title: string, message: string, duration = 5000): string {
    return this.showNotification({
      type: 'info',
      title,
      message,
      duration
    });
  }

  setRateLimit(resetTime?: Date): void {
    this.isRateLimited.set(true);
    this.rateLimitReset.set(resetTime || new Date(Date.now() + 60000)); // 1 minute default

    // Auto reset after the time
    setTimeout(() => {
      this.isRateLimited.set(false);
      this.rateLimitReset.set(null);
    }, resetTime ? resetTime.getTime() - Date.now() : 60000);
  }

  clearRateLimit(): void {
    this.isRateLimited.set(false);
    this.rateLimitReset.set(null);
  }

  setGlobalLoading(loading: boolean): void {
    this.globalLoading.set(loading);
  }
}