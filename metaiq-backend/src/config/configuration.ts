export interface DatabaseConfig {
  type: 'sqlite' | 'postgres';
  database?: string;
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  ssl?: boolean | object;
}

export interface JwtConfig {
  secret: string;
  refreshSecret: string;
  expiresIn: string | number;
  refreshExpiresIn: string | number;
}

export interface AppConfig {
  port: number;
  frontendUrl: string;
  nodeEnv: string;
  cryptoSecret: string;
}

export interface Config {
  app: AppConfig;
  database: DatabaseConfig;
  jwt: JwtConfig;
}

export default (): Config => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const databaseUrl = process.env.DATABASE_URL;
  const postgresHost = process.env.POSTGRES_HOST;
  const usePostgres = Boolean(databaseUrl || postgresHost);

  return {
    app: {
      port: parseInt(process.env.PORT || '3000', 10),
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4200',
      nodeEnv,
      cryptoSecret: process.env.CRYPTO_SECRET || 'default-key-32-characters-minimum',
    },
    database: usePostgres
      ? {
          type: 'postgres',
          url: databaseUrl,
          host: postgresHost,
          port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
          username: process.env.POSTGRES_USER || 'postgres',
          password: process.env.POSTGRES_PASSWORD || 'postgres',
          database: process.env.POSTGRES_DB || 'metaiq',
          ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
        }
      : {
          type: 'sqlite',
          database: process.env.SQLITE_PATH || './data/metaiq.db',
        },
    jwt: {
      secret: process.env.JWT_SECRET ?? (() => { throw new Error('JWT_SECRET não configurado'); })(),
      refreshSecret: process.env.JWT_REFRESH_SECRET ?? (() => { throw new Error('JWT_REFRESH_SECRET não configurado'); })(),
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },
  };
};