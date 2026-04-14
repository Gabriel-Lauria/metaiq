import { registerAs } from '@nestjs/config';

export interface AppConfig {
  port: number;
  frontendUrl: string;
  nodeEnv: string;
  cryptoSecret: string;
}

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4200',
  nodeEnv: process.env.NODE_ENV || 'development',
  cryptoSecret: process.env.CRYPTO_SECRET || 'replace-with-a-secure-secret',
}));
