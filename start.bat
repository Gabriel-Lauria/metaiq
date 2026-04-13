@echo off
REM Script de inicialização do MetaIQ para Windows
REM Executa: start.bat

setlocal enabledelayedexpansion

echo.
echo 🚀 Iniciando MetaIQ...
echo.

REM ── Verificar pré-requisitos ──────────────────────────────────
where node >nul 2>nul
if errorlevel 1 (
  echo ❌ Node.js não está instalado
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ❌ npm não está instalado
  pause
  exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
for /f "tokens=*" %%i in ('npm --version') do set NPM_VER=%%i

echo ✓ Node.js %NODE_VER%
echo ✓ npm %NPM_VER%
echo.

REM ── Diretório de dados ────────────────────────────────────────
if not exist "metaiq-backend\data" mkdir metaiq-backend\data

REM ── Verificar e criar .env ────────────────────────────────────
if not exist "metaiq-backend\.env" (
  echo 📝 Criando .env...
  copy metaiq-backend\.env.example metaiq-backend\.env
  echo.
  echo ⚠️  Edite metaiq-backend\.env com valores únicos para JWT_SECRET e CRYPTO_SECRET
  echo.
)

REM ── Instalar dependências do backend ──────────────────────────
echo 📦 Verificando dependências do backend...
if not exist "metaiq-backend\node_modules" (
  cd metaiq-backend
  call npm install
  cd ..
)

REM ── Instalar dependências do frontend ─────────────────────────
echo 📦 Verificando dependências do frontend...
if not exist "metaiq-frontend\node_modules" (
  cd metaiq-frontend
  call npm install
  cd ..
)

echo.
echo ✅ Ambiente preparado!
echo.
echo 🎬 Para iniciar o desenvolvimento:
echo.
echo Terminal 1 (Backend):
echo   cd metaiq-backend
echo   npm run seed  [criar dados de demo - primeira vez]
echo   npm run start:dev
echo.
echo Terminal 2 (Frontend):
echo   cd metaiq-frontend
echo   npm start
echo.
echo Acesse: http://localhost:4200
echo Login: demo@metaiq.dev / Demo@1234
echo.
pause
