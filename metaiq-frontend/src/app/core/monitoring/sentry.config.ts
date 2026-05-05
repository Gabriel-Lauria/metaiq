import * as Sentry from '@sentry/browser';
import { environment } from '../environment';

type BreadcrumbLevel = 'debug' | 'info' | 'warning' | 'error';

/**
 * Inicializar Sentry para error tracking
 * Use no main.ts antes de bootstrapApplication
 */
export function initSentry() {
  if (environment.production && environment.sentryDsn) {
    Sentry.init({
      dsn: environment.sentryDsn,
      environment: environment.production ? 'production' : 'development',
      tracesSampleRate: environment.production ? 0.1 : 1.0,
      release: '1.0.0',
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      enabled: environment.production,
    });
  }
}

/**
 * Capturar exceção com contexto
 */
export function captureException(error: Error, context?: Record<string, unknown>) {
  Sentry.captureException(error, {
    contexts: {
      app: context,
    },
  });
}

/**
 * Capturar mensagem de log
 */
export function captureMessage(message: string, level: BreadcrumbLevel = 'info') {
  Sentry.captureMessage(message, level);
}

/**
 * Adicionar breadcrumb para melhor rastreamento
 */
export function addBreadcrumb(message: string, category: string, level: BreadcrumbLevel = 'info') {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    timestamp: Date.now() / 1000,
  });
}
