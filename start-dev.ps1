# Script para iniciar o MetaIQ (Development Mode)
# Compatível com Windows PowerShell

Write-Host "======================================" -ForegroundColor Green
Write-Host "🚀 MetaIQ - Inicializador de Desenvolvimento" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Green
Write-Host ""

# Verificar se as pastas existem
if (-not (Test-Path "metaiq-backend")) {
    Write-Host "❌ Pasta 'metaiq-backend' não encontrada!" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "frontend")) {
    Write-Host "❌ Pasta 'frontend' não encontrada!" -ForegroundColor Red
    Write-Host "📝 Execute: npm create vite@latest frontend -- --template react-ts" -ForegroundColor Yellow
    exit 1
}

Write-Host "📦 Verificando dependências..." -ForegroundColor Blue
Write-Host ""

# Backend
Write-Host "🔧 Backend:" -ForegroundColor Yellow
if (-not (Test-Path "metaiq-backend/node_modules")) {
    Write-Host "   📥 Instalando dependências..." -ForegroundColor Cyan
    Push-Location metaiq-backend
    npm install
    Pop-Location
}
else {
    Write-Host "   ✅ Dependências já instaladas" -ForegroundColor Green
}

# Frontend  
Write-Host ""
Write-Host "🎨 Frontend:" -ForegroundColor Yellow
if (-not (Test-Path "frontend/node_modules")) {
    Write-Host "   📥 Instalando dependências..." -ForegroundColor Cyan
    Push-Location frontend
    npm install
    Pop-Location
}
else {
    Write-Host "   ✅ Dependências já instaladas" -ForegroundColor Green
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "✅ Tudo pronto! Iniciando serviços..." -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""

# Iniciar backend em nova janela
Write-Host "🚀 Iniciando Backend (http://localhost:3000)..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList @("-NoExit", "-Command", "cd '$PWD\metaiq-backend'; npm run start:dev")

# Aguardar um pouco
Start-Sleep -Seconds 3

# Iniciar frontend em nova janela
Write-Host "🎨 Iniciando Frontend (http://localhost:5173)..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList @("-NoExit", "-Command", "cd '$PWD\frontend'; npm run dev")

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "✨ MetaIQ está rodando!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Frontend:  http://localhost:5173" -ForegroundColor Cyan
Write-Host "Backend:   http://localhost:3000" -ForegroundColor Cyan
Write-Host "Database:  localhost:5432" -ForegroundColor Cyan
Write-Host ""
Write-Host "As janelas acima estarão rodando em background." -ForegroundColor Yellow
Write-Host "Para parar, feche as janelas ou use Ctrl+C em cada uma." -ForegroundColor Yellow
