import { registerAs } from '@nestjs/config';

export interface AppConfig {
  port: number;
  frontendUrl: string;
  nodeEnv: string;
  cryptoSecret: string;
}

function requireProductionSecret(name: string, fallback: string): string {
  const value = process.env[name] || fallback;
  if (process.env.NODE_ENV === 'production' && value === fallback) {
    throw new Error(`${name} must be set in production`);
  }
  return value;
}

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT || '3004', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4200',
  nodeEnv: process.env.NODE_ENV || 'development',
  cryptoSecret: requireProductionSecret('CRYPTO_SECRET', 'replace-with-a-secure-secret'),
}));
