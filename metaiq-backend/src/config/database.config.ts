import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  type: 'sqlite' | 'postgres';
  database?: string;
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  ssl?: boolean | object;
  synchronize: boolean;
  migrationsRun: boolean;
}

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return value === 'true';
};

export default registerAs('database', () => ({
  type: (process.env.DATABASE_TYPE as 'sqlite' | 'postgres') || 'sqlite',
  database:
    process.env.SQLITE_PATH ||
    process.env.DATABASE ||
    process.env.POSTGRES_DB ||
    './data/metaiq.db',
  url: process.env.DATABASE_URL,
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  username: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
  synchronize: parseBoolean(
    process.env.TYPEORM_SYNCHRONIZE,
    process.env.NODE_ENV !== 'production',
  ),
  migrationsRun: parseBoolean(process.env.TYPEORM_MIGRATIONS_RUN, false),
}));
