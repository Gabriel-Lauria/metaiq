/**
 * Configuração de ambiente para desenvolvimento
 * Para produção, crie um environment.prod.ts com valores reais
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
  metaAppId: process.env['META_APP_ID'] || '',
  logLevel: 'debug',
};
