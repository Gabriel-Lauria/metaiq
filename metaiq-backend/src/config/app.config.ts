import { registerAs } from '@nestjs/config';

export interface AppConfig {
  port: number;
  frontendUrl: string;
  nodeEnv: string;
  cryptoSecret: string;
}

export default registerAs('app', () => ({
  port: 3004, // Forçado temporariamente para evitar conflitos
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4200',
  nodeEnv: process.env.NODE_ENV || 'development',
  cryptoSecret: process.env.CRYPTO_SECRET || 'replace-with-a-secure-secret',
}));
