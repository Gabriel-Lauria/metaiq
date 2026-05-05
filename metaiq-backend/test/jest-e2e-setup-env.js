const { readJsonIfExists, runtimeEnvPath } = require('./e2e-runtime');

const runtimeEnv = readJsonIfExists(runtimeEnvPath);

if (!runtimeEnv) {
  throw new Error('Missing E2E runtime environment. Run the Jest E2E suite through the configured npm scripts.');
}

Object.assign(process.env, runtimeEnv);
