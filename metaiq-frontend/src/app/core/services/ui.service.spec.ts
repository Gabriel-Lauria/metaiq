import { TestBed } from '@angular/core/testing';
import { UiService, Notification } from './ui.service';

describe('UiService', () => {
  let service: UiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(UiService);
  });

  afterEach(() => {
    // Limpar notifications
    service.notifications.set([]);
  });

  describe('Notifications', () => {
    it('should create service', () => {
      expect(service).toBeTruthy();
    });

    it('should add notification', () => {
      const notificationId = service.showSuccess('Test Title', 'Test Message');

      expect(notificationId).toBeTruthy();
      expect(service.notifications().length).toBe(1);
    });

    it('should add notification with correct properties', () => {
      service.showSuccess('Success', 'Operation completed');

      const notification = service.notifications()[0];
      expect(notification.type).toBe('success');
      expect(notification.title).toBe('Success');
      expect(notification.message).toBe('Operation completed');
    });

    it('should remove notification', () => {
      const id = service.showSuccess('Test', 'Message');
      expect(service.notifications().length).toBe(1);

      service.removeNotification(id);
      expect(service.notifications().length).toBe(0);
    });

    it('should auto-remove notification after duration', (done) => {
      service.showNotification({
        type: 'info',
        title: 'Auto remove test',
        message: 'Should auto-remove',
        duration: 100 // 100ms
      });

      expect(service.notifications().length).toBe(1);

      setTimeout(() => {
        expect(service.notifications().length).toBe(0);
        done();
      }, 150);
    });

    it('should show error notification', () => {
      service.showError('Error', 'Error message');

      const notification = service.notifications()[0];
      expect(notification.type).toBe('error');
    });

    it('should show warning notification', () => {
      service.showWarning('Warning', 'Warning message');

      const notification = service.notifications()[0];
      expect(notification.type).toBe('warning');
    });
  });

  describe('Global Loading', () => {
    it('should set global loading state', () => {
      service.setGlobalLoading(true);
      expect(service.globalLoading()).toBe(true);

      service.setGlobalLoading(false);
      expect(service.globalLoading()).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should set rate limit', () => {
      service.setRateLimit();
      expect(service.isRateLimited()).toBe(true);
    });

    it('should clear rate limit', () => {
      service.setRateLimit();
      expect(service.isRateLimited()).toBe(true);

      service.clearRateLimit();
      expect(service.isRateLimited()).toBe(false);
    });

    it('should auto-reset rate limit after timeout', (done) => {
      service.setRateLimit(new Date(Date.now() + 100)); // 100ms

      setTimeout(() => {
        expect(service.isRateLimited()).toBe(false);
        done();
      }, 150);
    });
  });

  describe('Multiple Notifications', () => {
    it('should handle multiple notifications', () => {
      service.showSuccess('Success 1', 'Message 1');
      service.showError('Error 1', 'Message 1');
      service.showWarning('Warning 1', 'Message 1');

      expect(service.notifications().length).toBe(3);
    });

    it('should maintain FIFO order', () => {
      service.showSuccess('First', 'First message');
      service.showError('Second', 'Second message');

      const notifications = service.notifications();
      expect(notifications[0].title).toBe('First');
      expect(notifications[1].title).toBe('Second');
    });
  });
});
