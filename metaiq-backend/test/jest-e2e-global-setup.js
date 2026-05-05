const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');
const {
  ensureRuntimeDir,
  runtimeEnvPath,
  runtimeMetaPath,
} = require('./e2e-runtime');

function loadBaseEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  dotenv.config({ path: envPath });
}

function getEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== '') {
      return value;
    }
  }

  return undefined;
}

function requiredEnv(...names) {
  const value = getEnv(...names);
  if (!value) {
    throw new Error(`Missing required environment variable for E2E setup: ${names.join(' or ')}`);
  }

  return value;
}

function buildAdminConnection() {
  const host = getEnv('DB_HOST', 'POSTGRES_HOST') || 'localhost';
  const port = Number(getEnv('DB_PORT', 'POSTGRES_PORT') || '5432');
  const user = requiredEnv('DB_USER', 'POSTGRES_USER');
  const password = requiredEnv('DB_PASSWORD', 'POSTGRES_PASSWORD');
  const database =
    getEnv('E2E_POSTGRES_MAINTENANCE_DB') ||
    getEnv('DB_NAME', 'POSTGRES_DB', 'DATABASE') ||
    'postgres';
  const ssl = getEnv('DB_SSL', 'POSTGRES_SSL') === 'true' ? { rejectUnauthorized: false } : false;

  return { host, port, user, password, database, ssl };
}

function buildConnectionUrl({ host, port, user, password, database, ssl }) {
  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const query = ssl ? '?sslmode=require' : '';
  return `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${database}${query}`;
}

module.exports = async () => {
  loadBaseEnv();

  const adminConfig = buildAdminConnection();
  const dbName = `nexora_e2e_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const adminClient = new Client(adminConfig);

  try {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${dbName}"`);
  } catch (error) {
    throw new Error(
      `Failed to create isolated PostgreSQL database for E2E tests. ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await adminClient.end().catch(() => undefined);
  }

  const runtimeEnv = {
    NODE_ENV: 'test',
    E2E_DB_TYPE: 'postgres',
    DB_TYPE: 'postgres',
    DATABASE_TYPE: 'postgres',
    DB_HOST: adminConfig.host,
    POSTGRES_HOST: adminConfig.host,
    DB_PORT: String(adminConfig.port),
    POSTGRES_PORT: String(adminConfig.port),
    DB_USER: adminConfig.user,
    POSTGRES_USER: adminConfig.user,
    DB_PASSWORD: adminConfig.password,
    POSTGRES_PASSWORD: adminConfig.password,
    DB_NAME: dbName,
    POSTGRES_DB: dbName,
    DATABASE: dbName,
    DB_URL: buildConnectionUrl({ ...adminConfig, database: dbName }),
    DATABASE_URL: buildConnectionUrl({ ...adminConfig, database: dbName }),
    DB_SSL: adminConfig.ssl ? 'true' : 'false',
    POSTGRES_SSL: adminConfig.ssl ? 'true' : 'false',
    TYPEORM_SYNCHRONIZE: 'false',
    TYPEORM_MIGRATIONS_RUN: 'true',
    AUTH_ENABLE_PUBLIC_REGISTER: 'false',
    JWT_SECRET: 'test-only-jwt-secret',
    JWT_REFRESH_SECRET: 'test-only-refresh-secret',
    COOKIE_SECRET: 'test-only-cookie-secret',
    CRYPTO_SECRET: 'test-only-crypto-secret',
    META_APP_ID: '123456789012345',
    META_APP_SECRET: 'test-only-meta-secret',
    META_REDIRECT_URI: 'http://localhost:3004/api/integrations/meta/oauth/callback',
    META_OAUTH_SCOPES: 'ads_read,ads_management,business_management',
    AUTH_ENABLE_DEV_META_CONNECT: 'false',
  };

  ensureRuntimeDir();
  fs.writeFileSync(runtimeEnvPath, JSON.stringify(runtimeEnv, null, 2));
  fs.writeFileSync(
    runtimeMetaPath,
    JSON.stringify(
      {
        dbName,
        adminConfig,
      },
      null,
      2,
    ),
  );
};
