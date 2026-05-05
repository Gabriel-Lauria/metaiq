const dotenv = require('dotenv');
const path = require('path');
const { Client } = require('pg');
const {
  readJsonIfExists,
  removeRuntimeArtifacts,
  runtimeMetaPath,
} = require('./e2e-runtime');

function loadBaseEnv() {
  dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
}

module.exports = async () => {
  loadBaseEnv();

  const runtimeMeta = readJsonIfExists(runtimeMetaPath);
  if (!runtimeMeta?.dbName || !runtimeMeta?.adminConfig) {
    removeRuntimeArtifacts();
    return;
  }

  const client = new Client(runtimeMeta.adminConfig);

  try {
    await client.connect();
    await client.query(
      `
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()
      `,
      [runtimeMeta.dbName],
    );
    await client.query(`DROP DATABASE IF EXISTS "${runtimeMeta.dbName}"`);
  } finally {
    await client.end().catch(() => undefined);
    removeRuntimeArtifacts();
  }
};
