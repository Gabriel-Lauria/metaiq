import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { User } from './modules/users/user.entity';
import { AdAccount } from './modules/ad-accounts/ad-account.entity';
import { Campaign } from './modules/campaigns/campaign.entity';
import { MetricDaily } from './modules/metrics/metric-daily.entity';
import { Insight } from './modules/insights/insight.entity';
import { Manager } from './modules/managers/manager.entity';
import { Store } from './modules/stores/store.entity';
import { UserStore } from './modules/user-stores/user-store.entity';

dotenv.config({ quiet: true } as dotenv.DotenvConfigOptions & { quiet: true });

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return value === 'true';
};

const commonOptions = {
  entities: [User, Manager, Store, UserStore, AdAccount, Campaign, MetricDaily, Insight],
  migrations: ['src/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: parseBoolean(process.env.TYPEORM_LOGGING, false),
};

const databaseType = process.env.DATABASE_TYPE || 'sqlite';

const postgresOptions = (): DataSourceOptions => {
  const url = process.env.DATABASE_URL;

  return {
    ...commonOptions,
    type: 'postgres',
    ...(url
      ? { url }
      : {
          host: process.env.POSTGRES_HOST || 'localhost',
          port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
          username: process.env.POSTGRES_USER || 'postgres',
          password: process.env.POSTGRES_PASSWORD || 'postgres',
          database: process.env.POSTGRES_DB || process.env.DATABASE || 'metaiq',
        }),
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
};

const sqliteOptions = (): DataSourceOptions => ({
  ...commonOptions,
  type: 'sqlite',
  database: process.env.SQLITE_PATH || process.env.DATABASE || './data/metaiq.db',
});

export default new DataSource(
  databaseType === 'postgres' ? postgresOptions() : sqliteOptions(),
);
