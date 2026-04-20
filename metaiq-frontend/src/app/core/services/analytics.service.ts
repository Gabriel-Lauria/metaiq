import { Injectable, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';

/**
 * Analytics Service para rastreamento de eventos
 * Integração com Google Analytics, Mixpanel, etc
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private router = inject(Router);
  private isInitialized = false;

  /**
   * Inicializar analytics
   */
  initialize(): void {
    if (this.isInitialized) return;

    // Rastrear mudanças de página
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.trackPageView(event.url);
      });

    this.isInitialized = true;
  }

  /**
   * Rastrear visualização de página
   */
  trackPageView(path: string): void {
    console.log(`[Analytics] Page view: ${path}`);
    
    // Integração com Google Analytics
    if (typeof gtag !== 'undefined') {
      gtag('config', 'GA_MEASUREMENT_ID', {
        page_path: path,
      });
    }
  }

  /**
   * Rastrear evento customizado
   */
  trackEvent(
    eventName: string,
    eventCategory: string,
    eventLabel?: string,
    eventValue?: number
  ): void {
    console.log(`[Analytics] Event: ${eventName}`, { category: eventCategory, label: eventLabel, value: eventValue });

    // Integração com Google Analytics
    if (typeof gtag !== 'undefined') {
      gtag('event', eventName, {
        event_category: eventCategory,
        event_label: eventLabel,
        value: eventValue,
      });
    }
  }

  /**
   * Rastrear login
   */
  trackLogin(provider: string): void {
    this.trackEvent('login', 'auth', provider);
  }

  /**
   * Rastrear logout
   */
  trackLogout(): void {
    this.trackEvent('logout', 'auth');
  }

  /**
   * Rastrear criação de campanha
   */
  trackCampaignCreated(campaignId: string): void {
    this.trackEvent('campaign_created', 'campaigns', campaignId);
  }

  /**
   * Rastrear erro
   */
  trackError(errorMessage: string, errorCategory: string): void {
    this.trackEvent('error', errorCategory, errorMessage);
  }

  /**
   * Definir propriedades do usuário
   */
  setUserProperties(userId: string, properties: Record<string, any>): void {
    console.log(`[Analytics] Set user properties for ${userId}`, properties);

    // Integração com Google Analytics
    if (typeof gtag !== 'undefined') {
      gtag('set', {
        user_id: userId,
        ...properties
      });
    }
  }

  /**
   * Limpar dados de analytics (logout)
   */
  clearUser(): void {
    console.log('[Analytics] Clearing user data');
    
    if (typeof gtag !== 'undefined') {
      gtag('set', { 'user_id': null });
    }
  }
}

/**
 * Declaração global do gtag para TypeScript
 */
declare var gtag: Function;
