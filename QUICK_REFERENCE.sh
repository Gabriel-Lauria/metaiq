#!/bin/bash
# 🎯 MetaIQ - Quick Reference Guide

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                  🎯 MetaIQ Quick Reference                     ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}📍 URLS DE ACESSO${NC}"
echo "  Frontend:  http://localhost:5173"
echo "  Backend:   http://localhost:3000"
echo "  Database:  localhost:5432"
echo ""

echo -e "${BLUE}📁 ESTRUTURA${NC}"
echo "  metaiq-backend/     → Backend NestJS + PostgreSQL"
echo "  frontend/           → Frontend React + Vite (✨ NOVO)"
echo "  metaiq-frontend/    → Antigo (HTML) - Deprecated"
echo ""

echo -e "${BLUE}🚀 COMO INICIAR${NC}"
echo ""
echo "  Opção 1: Script automático (Linux/Mac)"
echo "    ./start-dev.sh"
echo ""
echo "  Opção 2: Script automático (Windows PowerShell)"
echo "    .\\start-dev.ps1"
echo ""
echo "  Opção 3: Manual (dois terminais)"
echo "    Terminal 1:  cd metaiq-backend && npm run start:dev"
echo "    Terminal 2:  cd frontend && npm run dev"
echo ""

echo -e "${BLUE}🔐 TESTE DE LOGIN${NC}"
echo "  URL: http://localhost:5173"
echo "  Email: usuario@teste.com"
echo "  Senha: 123456"
echo "  (Crie usuários conforme necessário)"
echo ""

echo -e "${BLUE}📦 ARQUIVOS CRIADOS${NC}"
echo ""
echo "  Frontend:"
echo "    src/pages/Login.tsx              → Página de login"
echo "    src/pages/Dashboard.tsx          → Dashboard com campanhas"
echo "    src/services/api.ts              → Cliente API com JWT"
echo "    src/hooks/useAuth.ts             → Lógica de autenticação"
echo "    src/App.tsx                      → Rotas (Login + Dashboard)"
echo ""
echo "  Documentação:"
echo "    STATUS_SPRINT_1.md               → Status completo"
echo "    GUIA_TESTE_SISTEMA.md            → Como testar"
echo "    README_COMPLETO.md               → Documentação completa"
echo "    start-dev.sh                     → Script start (Linux/Mac)"
echo "    start-dev.ps1                    → Script start (Windows)"
echo ""

echo -e "${BLUE}🔑 FEATURES IMPLEMENTADAS${NC}"
echo "  ✅ Login com JWT"
echo "  ✅ Dashboard com campanhas"
echo "  ✅ Proteção de rotas"
echo "  ✅ Logout"
echo "  ✅ Fetch de dados da API"
echo "  ✅ UI/UX moderno e responsivo"
echo "  ✅ TypeScript em todo frontend"
echo ""

echo -e "${BLUE}🛠️ TECNOLOGIAS${NC}"
echo "  Frontend: React 18 + Vite + TypeScript + React Router"
echo "  Backend:  NestJS + TypeORM + PostgreSQL + JWT"
echo "  Database: PostgreSQL 14+"
echo ""

echo -e "${BLUE}💡 DICAS${NC}"
echo "  • Abra http://localhost:5173 no navegador"
echo "  • F12 para DevTools (verá token em localStorage)"
echo "  • localStorage.clear() para limpar dados"
echo "  • Backend logs em Terminal 1"
echo "  • Frontend HMR (Hot Reload) em Ctrl+S"
echo ""

echo -e "${YELLOW}⚠️  PRÓXIMOS PASSOS${NC}"
echo "  1. Testar login/logout no frontend"
echo "  2. Adicionar mais dados ao banco"
echo "  3. Adicionar gráficos (Chart.js)"
echo "  4. Criar página de detalhes"
echo "  5. Implementar CRUD de campanhas"
echo ""

echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗"
echo "║              ✨ Sistema pronto para usar! ✨                  ║"
echo "╚════════════════════════════════════════════════════════════════╝${NC}"
