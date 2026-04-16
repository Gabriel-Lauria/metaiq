export * from './app.config';
export * from './database.config';
export * from './jwt.config';
export * from './meta.config';

export type Config = {
  app: import('./app.config').AppConfig;
  database: import('./database.config').DatabaseConfig;
  jwt: import('./jwt.config').JwtConfig;
  meta: import('./meta.config').MetaConfig;
};
