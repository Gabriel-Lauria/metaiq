import { registerAs } from '@nestjs/config';

export interface MetaConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  apiVersion: string;
  oauthScopes: string[];
  enableDevConnect: boolean;
}

export default registerAs('meta', () => ({
  appId: process.env.META_APP_ID || '',
  appSecret: process.env.META_APP_SECRET || '',
  redirectUri:
    process.env.META_REDIRECT_URI ||
    'http://localhost:3004/api/integrations/meta/oauth/callback',
  apiVersion: process.env.META_API_VERSION || 'v19.0',
  oauthScopes: (process.env.META_OAUTH_SCOPES || 'ads_read,ads_management,business_management')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean),
  enableDevConnect: process.env.AUTH_ENABLE_DEV_META_CONNECT === 'true',
}));
