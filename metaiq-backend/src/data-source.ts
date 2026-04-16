import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { User } from './modules/users/user.entity';
import { Manager } from './modules/managers/manager.entity';
import { Tenant } from './modules/tenants/tenant.entity';
import { Store } from './modules/stores/store.entity';
import { UserStore } from './modules/user-stores/user-store.entity';
import { AdAccount } from './modules/ad-accounts/ad-account.entity';
import { Campaign } from './modules/campaigns/campaign.entity';
import { MetricDaily } from './modules/metrics/metric-daily.entity';
import { Insight } from './modules/insights/insight.entity';
import { StoreIntegration } from './modules/integrations/store-integration.entity';
import { OAuthState } from './modules/integrations/oauth-state.entity';
import { MetaCampaignCreation } from './modules/integrations/meta/meta-campaign-creation.entity';

dotenv.config({ quiet: true } as dotenv.DotenvConfigOptions & { quiet: true });

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

const commonOptions = {
  entities: [User, Manager, Tenant, Store, UserStore, AdAccount, Campaign, MetricDaily, Insight, StoreIntegration, OAuthState, MetaCampaignCreation],
  migrations: ['src/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: parseBoolean(process.env.TYPEORM_LOGGING, false),
};

const databaseType = getEnv('DB_TYPE', 'DATABASE_TYPE') || 'postgres';

const postgresOptions = (): DataSourceOptions => {
  const url = getEnv('DB_URL', 'DATABASE_URL');

  return {
    ...commonOptions,
    type: 'postgres',
    ...(url
      ? { url }
      : {
          host: getEnv('DB_HOST', 'POSTGRES_HOST') || 'localhost',
          port: parseInt(getEnv('DB_PORT', 'POSTGRES_PORT') || '5432', 10),
          username: getEnv('DB_USER', 'POSTGRES_USER') || 'metaiq',
          password: getEnv('DB_PASSWORD', 'POSTGRES_PASSWORD') || 'metaiq',
          database: getEnv('DB_NAME', 'POSTGRES_DB', 'DATABASE') || 'metaiq',
        }),
    ssl: getEnv('DB_SSL', 'POSTGRES_SSL') === 'true' ? { rejectUnauthorized: false } : false,
  };
};

const sqliteOptions = (): DataSourceOptions => ({
  ...commonOptions,
  type: 'sqlite',
  database: getEnv('SQLITE_PATH', 'DATABASE') || './data/metaiq.db',
});

export default new DataSource(
  databaseType === 'postgres' ? postgresOptions() : sqliteOptions(),
);
