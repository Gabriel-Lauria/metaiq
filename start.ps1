#!/usr/bin/env pwsh
# MetaIQ - Script para iniciar Frontend e Backend

Write-Host @"
╔════════════════════════════════════════════════════╗
║           🚀 MetaIQ - Iniciando Servidores         ║
╚════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan

# Matar processos antigos se existirem
Write-Host "🧹 Limpando processos antigos..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Backend
Write-Host "`n📦 Iniciando Backend (NestJS)..." -ForegroundColor Green
$backendPath = Join-Path $PSScriptRoot "metaiq-backend"
$backendProcess = Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/k cd /d $backendPath && npm run start:prod" `
  -PassThru `
  -WindowStyle Normal

Write-Host "   ✓ Backend PID: $($backendProcess.Id)" -ForegroundColor Green

# Frontend
Write-Host "`n🎨 Iniciando Frontend (Express)..." -ForegroundColor Green
$frontendPath = Join-Path $PSScriptRoot "metaiq-frontend"
$frontendProcess = Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/k cd /d $frontendPath && npm start" `
  -PassThru `
  -WindowStyle Normal

Write-Host "   ✓ Frontend PID: $($frontendProcess.Id)" -ForegroundColor Green

# Esperar um pouco e mostrar status
Start-Sleep -Seconds 3

Write-Host @"

╔════════════════════════════════════════════════════╗
║            ✅ Servidores Iniciados                ║
╠════════════════════════════════════════════════════╣
║                                                    ║
║  🌐 Frontend:   http://localhost:4200              ║
║  📡 Backend:    http://localhost:3000              ║
║  🔄 Proxy API:  http://localhost:4200/api/*        ║
║                                                    ║
║  🔐 Demo Login:                                    ║
║     Email:    demo@metaiq.dev                     ║
║     Password: Demo@1234                           ║
║                                                    ║
╚════════════════════════════════════════════════════╝

💡 Se algo der errado, verifique se as portas 3000 e 4200 estão livres.
📝 Pressione CTRL+C em qualquer janela para desligar o servidor.

"@ -ForegroundColor Cyan

# Aguardar encerramento
$backendProcess.WaitForExit()
