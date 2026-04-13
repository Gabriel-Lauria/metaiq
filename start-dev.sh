#!/bin/bash
# Script para iniciar o MetaIQ (Development Mode)
# Funciona em Windows (PowerShell) e Linux/Mac (Bash)

echo "======================================"
echo "🚀 MetaIQ - Inicializador de Desenvolvimento"
echo "======================================"
echo ""

# Cores (ANSI)
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se as pastas existem
if [ ! -d "metaiq-backend" ]; then
    echo "❌ Pasta 'metaiq-backend' não encontrada!"
    exit 1
fi

if [ ! -d "frontend" ]; then
    echo "❌ Pasta 'frontend' não encontrada!"
    echo "📝 Execute: npm create vite@latest frontend -- --template react-ts"
    exit 1
fi

echo -e "${BLUE}📦 Verificando dependências...${NC}"
echo ""

# Backend
echo -e "${YELLOW}🔧 Backend:${NC}"
if [ ! -d "metaiq-backend/node_modules" ]; then
    echo "   📥 Instalando dependências..."
    cd metaiq-backend
    npm install
    cd ..
else
    echo "   ✅ Dependências já instaladas"
fi

# Frontend  
echo ""
echo -e "${YELLOW}🎨 Frontend:${NC}"
if [ ! -d "frontend/node_modules" ]; then
    echo "   📥 Instalando dependências..."
    cd frontend
    npm install
    cd ..
else
    echo "   ✅ Dependências já instaladas"
fi

echo ""
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}✅ Tudo pronto! Iniciando serviços...${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""

# Iniciar backend em background
echo -e "${YELLOW}🚀 Iniciando Backend (http://localhost:3000)...${NC}"
(cd metaiq-backend && npm run start:dev) &
BACKEND_PID=$!

# Aguardar um pouco para o backend inicializar
sleep 3

# Iniciar frontend em outra guia/janela
echo -e "${YELLOW}🎨 Iniciando Frontend (http://localhost:5173)...${NC}"
(cd frontend && npm run dev) &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}✨ MetaIQ está rodando!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""
echo -e "${BLUE}Frontend:${NC}  http://localhost:5173"
echo -e "${BLUE}Backend:${NC}   http://localhost:3000"
echo -e "${BLUE}Database:${NC}  localhost:5432"
echo ""
echo -e "${YELLOW}⏹️  Para parar, pressione Ctrl+C${NC}"
echo ""

# Aguardar indefinidamente (até Ctrl+C)
wait $BACKEND_PID $FRONTEND_PID
