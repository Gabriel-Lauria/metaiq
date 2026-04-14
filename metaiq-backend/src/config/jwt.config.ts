import { registerAs } from '@nestjs/config';

export interface JwtConfig {
  secret: string;
  refreshSecret: string;
  expiresIn: string | number;
  refreshExpiresIn: string | number;
}

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET || 'replace-with-jwt-secret',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'replace-with-refresh-secret',
  expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
}));
