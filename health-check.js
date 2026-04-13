#!/usr/bin/env node

/**
 * Script de verificação de saúde do projeto MetaIQ
 * Executa: node health-check.js
 * 
 * Verifica:
 * - Node.js versão mínima
 * - npm disponível
 * - Dependências do backend instaladas
 * - Arquivo .env configurado
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MIN_NODE_VERSION = '18.0.0';
const checks = [];

function parseVersion(versionStr) {
  return versionStr.slice(1).split('.').map(Number);
}

function compareVersions(v1str, v2str) {
  const [major1, minor1, patch1] = parseVersion(v1str);
  const [major2, minor2, patch2] = parseVersion(v2str);

  if (major1 !== major2) return major1 > major2 ? 1 : -1;
  if (minor1 !== minor2) return minor1 > minor2 ? 1 : -1;
  if (patch1 !== patch2) return patch1 > patch2 ? 1 : -1;
  return 0;
}

function check(name, fn) {
  try {
    fn();
    checks.push({ name, status: '✓', color: '32' }); // Verde
  } catch (e) {
    checks.push({ name, status: '✗', color: '31', error: e.message }); // Vermelho
  }
}

console.log('\n🏥 Verificando saúde do projeto MetaIQ...\n');

// ── Verificação 1: Node.js ────────────────────────────────────
check('Node.js >= ' + MIN_NODE_VERSION, () => {
  const version = process.version;
  if (compareVersions(version, 'v' + MIN_NODE_VERSION) < 0) {
    throw new Error(`Versão ${version} encontrada, mínimo é v${MIN_NODE_VERSION}`);
  }
});

// ── Verificação 2: npm ────────────────────────────────────────
check('npm disponível', () => {
  try {
    execSync('npm --version', { stdio: 'pipe' });
  } catch {
    throw new Error('npm não encontrado');
  }
});

// ── Verificação 3: .env ────────────────────────────────────────
check('Backend .env configurado', () => {
  const envPath = path.join(__dirname, 'metaiq-backend', '.env');
  const envExamplePath = path.join(__dirname, 'metaiq-backend', '.env.example');

  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(envExamplePath)) {
      throw new Error('.env não encontrado. Execute: cp .env.example .env');
    }
    throw new Error('.env e .env.example não encontrados');
  }

  const env = fs.readFileSync(envPath, 'utf-8');
  const required = ['JWT_SECRET', 'CRYPTO_SECRET'];
  const missing = required.filter(v => !env.includes(v + '='));

  if (missing.length > 0) {
    throw new Error(`Variáveis faltando: ${missing.join(', ')}`);
  }
});

// ── Verificação 4: node_modules backend ────────────────────────
check('Backend dependencies instaladas', () => {
  const modulesPath = path.join(__dirname, 'metaiq-backend', 'node_modules');
  if (!fs.existsSync(modulesPath)) {
    throw new Error('Execute: cd metaiq-backend && npm install');
  }
});

// ── Verificação 5: node_modules frontend ──────────────────────
check('Frontend dependencies instaladas', () => {
  const modulesPath = path.join(__dirname, 'metaiq-frontend', 'node_modules');
  if (!fs.existsSync(modulesPath)) {
    throw new Error('Execute: cd metaiq-frontend && npm install');
  }
});

// ── Verificação 6: Diretório de dados ─────────────────────────
check('Diretório de dados criável', () => {
  const dataDir = path.join(__dirname, 'metaiq-backend', 'data');
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch {
      throw new Error('Não é possível criar diretório de dados');
    }
  }
});

// ── Resultados ────────────────────────────────────────────────
console.log('Resultados:\n');
let allPassed = true;

checks.forEach(({ name, status, color, error }) => {
  const colored = `\x1b[${color}m${status}\x1b[0m`;
  console.log(`  ${colored} ${name}`);
  if (error) {
    console.log(`    → ${error}`);
    allPassed = false;
  }
});

console.log('\n' + (allPassed ? '✅ Tudo OK!' : '❌ Alguns problemas encontrados.'));
console.log('\n📚 Próximos passos:\n');

if (!allPassed) {
  console.log('1. Corrija os erros acima');
} else {
  console.log('1. Configure credenciais Meta em metaiq-backend/.env');
  console.log('2. Execute: cd metaiq-backend && npm run seed');
  console.log('3. Terminal 1: cd metaiq-backend && npm run start:dev');
  console.log('4. Terminal 2: cd metaiq-frontend && npm start');
  console.log('5. Acesse http://localhost:4200');
  console.log('6. Login: demo@metaiq.dev / Demo@1234\n');
}

process.exit(allPassed ? 0 : 1);
