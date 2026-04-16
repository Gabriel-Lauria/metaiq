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

const getEnv = (...names: string[]): string | undefined => {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== '') {
      return value;
    }
  }

  return undefined;
};

const dbType = (getEnv('DB_TYPE', 'DATABASE_TYPE') || 'postgres') as 'sqlite' | 'postgres';

export default registerAs('database', () => ({
  type: dbType,
  database:
    dbType === 'sqlite'
      ? getEnv('SQLITE_PATH', 'DATABASE') || './data/metaiq.db'
      : getEnv('DB_NAME', 'POSTGRES_DB', 'DATABASE') || 'metaiq',
  url: getEnv('DB_URL', 'DATABASE_URL'),
  host: getEnv('DB_HOST', 'POSTGRES_HOST') || 'localhost',
  port: parseInt(getEnv('DB_PORT', 'POSTGRES_PORT') || '5432', 10),
  username: getEnv('DB_USER', 'POSTGRES_USER') || 'metaiq',
  password: getEnv('DB_PASSWORD', 'POSTGRES_PASSWORD') || 'metaiq',
  ssl: getEnv('DB_SSL', 'POSTGRES_SSL') === 'true' ? { rejectUnauthorized: false } : false,
  synchronize: parseBoolean(
    process.env.TYPEORM_SYNCHRONIZE,
    false,
  ),
  migrationsRun: parseBoolean(process.env.TYPEORM_MIGRATIONS_RUN, false),
}));
