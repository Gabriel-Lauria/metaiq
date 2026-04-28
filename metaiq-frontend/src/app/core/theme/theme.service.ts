/**
 * Sistema de Tema Dark/Light Mode
 * Gerencia a troca de tema e persistência de preferência
 */

export interface ThemeConfig {
  name: 'light' | 'dark';
  colors: Record<string, string>;
}

export const LIGHT_THEME: ThemeConfig = {
  name: 'light',
  colors: {
    primary: '#3366FF',
    secondary: '#FFB84D',
    background: '#FFFFFF',
    surface: '#F5F7FA',
    text: '#1A1A1A',
    textSecondary: '#666666',
    border: '#E0E0E0',
    error: '#FF4444',
    success: '#44AA44',
    warning: '#FFAA00',
    info: '#3366FF',
  }
};

export const DARK_THEME: ThemeConfig = {
  name: 'dark',
  colors: {
    primary: '#4477FF',
    secondary: '#FFB84D',
    background: '#0F0F0F',
    surface: '#1A1A1A',
    text: '#FFFFFF',
    textSecondary: '#AAAAAA',
    border: '#333333',
    error: '#FF6666',
    success: '#66DD66',
    warning: '#FFBB33',
    info: '#4477FF',
  }
};

/**
 * Service para gerenciar tema dark/light
 */
export class ThemeService {
  private static readonly THEME_KEY = 'metaiq-theme';
  private static currentTheme: ThemeConfig = LIGHT_THEME;

  /**
   * Inicializa o tema forçando o padrão claro atual do produto
   */
  static initialize(): void {
    this.setTheme('light');
  }

  /**
   * Define o tema e aplica as CSS variables
   */
  static setTheme(themeName: 'light' | 'dark'): void {
    const theme = themeName === 'dark' ? DARK_THEME : LIGHT_THEME;
    this.currentTheme = theme;
    localStorage.setItem(this.THEME_KEY, themeName);

    // Aplicar CSS variables ao root
    const root = document.documentElement;
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });

    // Adicionar classe ao body
    document.body.classList.remove('light-theme', 'dark-theme');
    document.body.classList.add(`${themeName}-theme`);

    // Atualizar meta theme-color
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme.colors['primary']);
    }
  }

  /**
   * Alterna entre temas
   */
  static toggleTheme(): void {
    const newTheme = this.currentTheme.name === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  }

  /**
   * Obtém o tema atual
   */
  static getCurrentTheme(): ThemeConfig {
    return this.currentTheme;
  }

  /**
   * Monitora mudanças na preferência do SO
   */
  static watchSystemPreference(callback: (isDark: boolean) => void): () => void {
    if (!window.matchMedia) return () => {};

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => callback(e.matches);

    mediaQuery.addListener(listener);
    return () => mediaQuery.removeListener(listener);
  }
}
