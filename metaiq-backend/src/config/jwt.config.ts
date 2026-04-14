import { registerAs } from '@nestjs/config';

export interface JwtConfig {
  secret: string;
  refreshSecret: string;
  expiresIn: string | number;
  refreshExpiresIn: string | number;
}

function requireProductionSecret(name: string, fallback: string): string {
  const value = process.env[name] || fallback;
  if (process.env.NODE_ENV === 'production' && value === fallback) {
    throw new Error(`${name} must be set in production`);
  }
  return value;
}

export default registerAs('jwt', () => ({
  secret: requireProductionSecret('JWT_SECRET', 'replace-with-jwt-secret'),
  refreshSecret: requireProductionSecret('JWT_REFRESH_SECRET', 'replace-with-refresh-secret'),
  expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
}));
