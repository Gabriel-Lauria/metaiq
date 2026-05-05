/**
 * Production Environment Configuration
 * Use: ng build --configuration=production
 */
export const environment = {
  production: true,
  apiUrl: 'https://api.metaiq.com/api',
  enableDemoData: false,
  enableLogging: false,
  enableAnalytics: true,
  enablePublicRegister: false,
  sentryDsn: '',
  enableServiceWorker: true,
  cacheExpiration: 3600000, // 1 hour
};
