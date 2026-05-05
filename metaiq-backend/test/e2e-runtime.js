const fs = require('fs');
const path = require('path');

const runtimeDir = path.resolve(__dirname, '.runtime');
const runtimeEnvPath = path.join(runtimeDir, 'e2e-env.json');
const runtimeMetaPath = path.join(runtimeDir, 'e2e-meta.json');

function ensureRuntimeDir() {
  fs.mkdirSync(runtimeDir, { recursive: true });
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function removeRuntimeArtifacts() {
  if (fs.existsSync(runtimeEnvPath)) {
    fs.rmSync(runtimeEnvPath, { force: true });
  }

  if (fs.existsSync(runtimeMetaPath)) {
    fs.rmSync(runtimeMetaPath, { force: true });
  }

  if (fs.existsSync(runtimeDir)) {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

module.exports = {
  ensureRuntimeDir,
  readJsonIfExists,
  removeRuntimeArtifacts,
  runtimeDir,
  runtimeEnvPath,
  runtimeMetaPath,
};
