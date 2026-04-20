import { TestBed } from '@angular/core/testing';
import { ThemeService, LIGHT_THEME, DARK_THEME } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    // Limpar localStorage
    localStorage.clear();
    document.body.classList.remove('light-theme', 'dark-theme');
    document.documentElement.style.cssText = '';
  });

  describe('Theme Initialization', () => {
    it('should initialize with light theme by default', () => {
      ThemeService.initialize();
      expect(ThemeService.getCurrentTheme().name).toBe('light');
    });

    it('should persist theme preference in localStorage', () => {
      ThemeService.setTheme('dark');
      expect(localStorage.getItem('metaiq-theme')).toBe('dark');
    });

    it('should restore theme from localStorage', () => {
      localStorage.setItem('metaiq-theme', 'dark');
      ThemeService.initialize();
      expect(ThemeService.getCurrentTheme().name).toBe('dark');
    });
  });

  describe('Theme Switching', () => {
    it('should toggle between themes', () => {
      ThemeService.setTheme('light');
      expect(ThemeService.getCurrentTheme().name).toBe('light');

      ThemeService.toggleTheme();
      expect(ThemeService.getCurrentTheme().name).toBe('dark');

      ThemeService.toggleTheme();
      expect(ThemeService.getCurrentTheme().name).toBe('light');
    });

    it('should apply theme classes to body', () => {
      ThemeService.setTheme('light');
      expect(document.body.classList.contains('light-theme')).toBe(true);

      ThemeService.setTheme('dark');
      expect(document.body.classList.contains('dark-theme')).toBe(true);
    });

    it('should apply CSS variables to root element', () => {
      ThemeService.setTheme('light');
      const root = document.documentElement;
      expect(root.style.getPropertyValue('--color-primary')).toBe('#3366FF');

      ThemeService.setTheme('dark');
      expect(root.style.getPropertyValue('--color-primary')).toBe('#4477FF');
    });
  });

  describe('Theme Colors', () => {
    it('should have all required colors in light theme', () => {
      const requiredColors = ['primary', 'secondary', 'background', 'surface', 'text', 'textSecondary', 'border', 'error', 'success', 'warning', 'info'];
      requiredColors.forEach(color => {
        expect(LIGHT_THEME.colors[color]).toBeTruthy();
      });
    });

    it('should have all required colors in dark theme', () => {
      const requiredColors = ['primary', 'secondary', 'background', 'surface', 'text', 'textSecondary', 'border', 'error', 'success', 'warning', 'info'];
      requiredColors.forEach(color => {
        expect(DARK_THEME.colors[color]).toBeTruthy();
      });
    });

    it('should have different colors for light and dark themes', () => {
      expect(LIGHT_THEME.colors['background']).not.toBe(DARK_THEME.colors['background']);
      expect(LIGHT_THEME.colors['text']).not.toBe(DARK_THEME.colors['text']);
    });
  });

  describe('System Preference', () => {
    it('should watch system preference changes', () => {
      const callback = jasmine.createSpy('callback');
      const unwatch = ThemeService.watchSystemPreference(callback);

      expect(unwatch).toBeTruthy();
      expect(typeof unwatch).toBe('function');
    });
  });
});
