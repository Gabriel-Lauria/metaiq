#!/bin/bash
# Script de inicialização do MetaIQ
# Executa: ./start.sh (linux/mac) ou start.bat (windows)

set -e

echo "🚀 Iniciando MetaIQ..."
echo ""

# ── Verificar pré-requisitos ──────────────────────────────────
if ! command -v node &> /dev/null; then
  echo "❌ Node.js não está instalado"
  exit 1
fi

if ! command -v npm &> /dev/null; then
  echo "❌ npm não está instalado"
  exit 1
fi

echo "✓ Node.js $(node --version)"
echo "✓ npm $(npm --version)"
echo ""

# ── Diretório de dados ────────────────────────────────────────
mkdir -p metaiq-backend/data

# ── Verificar e criar .env ────────────────────────────────────
if [ ! -f metaiq-backend/.env ]; then
  echo "📝 Criando .env..."
  cp metaiq-backend/.env.example metaiq-backend/.env
  echo "⚠️  Edite metaiq-backend/.env com valores únicos para JWT_SECRET e CRYPTO_SECRET"
fi

# ── Instalar dependências ─────────────────────────────────────
echo "📦 Verificando dependências do backend..."
if [ ! -d metaiq-backend/node_modules ]; then
  cd metaiq-backend
  npm install
  cd ..
fi

echo "📦 Verificando dependências do frontend..."
if [ ! -d metaiq-frontend/node_modules ]; then
  cd metaiq-frontend
  npm install
  cd ..
fi

echo ""
echo "✅ Ambiente preparado!"
echo ""
echo "🎬 Para iniciar o desenvolvimento:"
echo ""
echo "Terminal 1 (Backend):"
echo "  cd metaiq-backend"
echo "  npm run seed  # Criar dados de demo (primeira vez)"
echo "  npm run start:dev"
echo ""
echo "Terminal 2 (Frontend):"
echo "  cd metaiq-frontend"
echo "  npm start"
echo ""
echo "Acesse: http://localhost:4200"
echo "Login: demo@metaiq.dev / Demo@1234"
echo ""
