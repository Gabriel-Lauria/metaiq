import { environment } from '../environment';

type BreadcrumbLevel = 'debug' | 'info' | 'warning' | 'error';

declare global {
  interface Window {
    Sentry?: {
      init?: (config: Record<string, unknown>) => void;
      captureException?: (error: Error, context?: Record<string, unknown>) => void;
      captureMessage?: (message: string, level?: BreadcrumbLevel) => void;
      addBreadcrumb?: (breadcrumb: Record<string, unknown>) => void;
    };
  }
}

function getSentryClient() {
  return typeof window !== 'undefined' ? window.Sentry : undefined;
}

/**
 * Inicializar Sentry para error tracking
 * Use no main.ts antes de bootstrapApplication
 */
export function initSentry() {
  const sentry = getSentryClient();
  if (environment.production && environment.sentryDsn && sentry?.init) {
    sentry.init({
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
  getSentryClient()?.captureException?.(error, {
    contexts: {
      app: context,
    },
  });
}

/**
 * Capturar mensagem de log
 */
export function captureMessage(message: string, level: BreadcrumbLevel = 'info') {
  getSentryClient()?.captureMessage?.(message, level);
}

/**
 * Adicionar breadcrumb para melhor rastreamento
 */
export function addBreadcrumb(message: string, category: string, level: BreadcrumbLevel = 'info') {
  getSentryClient()?.addBreadcrumb?.({
    message,
    category,
    level,
    timestamp: Date.now() / 1000,
  });
}
