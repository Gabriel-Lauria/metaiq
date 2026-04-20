import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../core/theme/theme.service';

/**
 * Componente para alternar entre temas light/dark
 * Coloque em qualquer lugar que desejar ter o toggle de tema
 * Ex: <app-theme-toggle></app-theme-toggle>
 */
@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button 
      class="theme-toggle-btn" 
      (click)="toggleTheme()"
      [title]="currentThemeName === 'dark' ? 'Modo claro' : 'Modo escuro'"
      aria-label="Alternar tema"
    >
      <span class="icon-sun" *ngIf="currentThemeName === 'dark'">☀️</span>
      <span class="icon-moon" *ngIf="currentThemeName === 'light'">🌙</span>
    </button>
  `,
  styles: [`
    .theme-toggle-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: 8px;
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-text);
      cursor: pointer;
      transition: all 0.3s ease;
      font-size: 20px;
      padding: 0;
    }

    .theme-toggle-btn:hover {
      background: var(--color-background);
      transform: scale(1.05);
    }

    .theme-toggle-btn:active {
      transform: scale(0.95);
    }

    .icon-sun,
    .icon-moon {
      display: inline-block;
      animation: rotate 0.5s ease-in-out;
    }

    @keyframes rotate {
      from {
        transform: rotate(0deg);
        opacity: 0;
      }
      to {
        transform: rotate(360deg);
        opacity: 1;
      }
    }
  `]
})
export class ThemeToggleComponent implements OnInit {
  currentThemeName: 'light' | 'dark' = 'light';

  ngOnInit(): void {
    this.currentThemeName = ThemeService.getCurrentTheme().name;
    
    // Monitorar mudanças no sistema
    ThemeService.watchSystemPreference((isDark) => {
      if (!localStorage.getItem('metaiq-theme')) {
        ThemeService.setTheme(isDark ? 'dark' : 'light');
        this.currentThemeName = isDark ? 'dark' : 'light';
      }
    });
  }

  toggleTheme(): void {
    ThemeService.toggleTheme();
    this.currentThemeName = ThemeService.getCurrentTheme().name;
  }
}
