#!/bin/bash

# ═══════════════════════════════════════════════════════════
# Script de Health Check - MetaIQ Production
# ═══════════════════════════════════════════════════════════

# Configurações
LOG_FILE="/opt/metaiq/logs/health-check.log"
TIMESTAMP=$(date +'%Y-%m-%d %H:%M:%S')

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Funções
log() {
    echo -e "${BLUE}[$TIMESTAMP]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}✅ $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}❌ $1${NC}" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}" | tee -a "$LOG_FILE"
}

# Criar log se não existir
mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"

# Status geral
STATUS_OK=true

log "🏥 Verificando saúde do sistema MetaIQ..."

# Backend API
if curl -sf http://localhost:3004/api/health > /dev/null 2>&1; then
    success "Backend API (3004) - OK"
else
    error "Backend API (3004) - DOWN"
    STATUS_OK=false
fi

# Frontend
if curl -sf http://localhost:3000 > /dev/null 2>&1; then
    success "Frontend (3000) - OK"
else
    error "Frontend (3000) - DOWN"
    STATUS_OK=false
fi

# PostgreSQL
if docker exec metaiq-postgres pg_isready -U metaiq_prod_user > /dev/null 2>&1; then
    success "PostgreSQL (5432) - OK"
    
    # Tamanho do banco
    DB_SIZE=$(docker exec metaiq-postgres psql -U metaiq_prod_user -d metaiq_prod -t -c "SELECT pg_size_pretty(pg_database_size('metaiq_prod'))" 2>/dev/null | tr -d ' ')
    log "  → Tamanho do banco: $DB_SIZE"
else
    error "PostgreSQL (5432) - DOWN"
    STATUS_OK=false
fi

# Redis
if docker exec metaiq-redis redis-cli ping > /dev/null 2>&1; then
    success "Redis Cache (6379) - OK"
    
    # Stats do Redis
    REDIS_MEMORY=$(docker exec metaiq-redis redis-cli info memory 2>/dev/null | grep used_memory_human | cut -d: -f2 | tr -d '\r')
    log "  → Memória usada: $REDIS_MEMORY"
else
    error "Redis Cache (6379) - DOWN"
    STATUS_OK=false
fi

# Nginx Reverse Proxy
if curl -sf https://app.seudominio.com.br > /dev/null 2>&1 2>&1; then
    success "Nginx Reverse Proxy - OK"
else
    warning "Nginx Reverse Proxy - Pode estar OFF-LINE"
fi

# Docker container status
log "📦 Status dos containers:"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep metaiq | while read name status; do
    if [[ $status == *"Up"* ]]; then
        success "  → $name ($status)"
    else
        error "  → $name ($status)"
        STATUS_OK=false
    fi
done

# Espaço em disco
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}')
DISK_AVAILABLE=$(df -h / | awk 'NR==2 {print $4}')
log "💾 Espaço em disco: $DISK_USAGE usado, $DISK_AVAILABLE disponível"

if (( ${DISK_USAGE%\%} > 80 )); then
    error "⚠️  Espaço em disco acima de 80%!"
    STATUS_OK=false
fi

# Memória do sistema
MEM_USAGE=$(free | awk 'NR==2 {printf("%d%%", $3*100/$2)}')
log "🧠 Memória: $MEM_USAGE"

if (( ${MEM_USAGE%\%} > 80 )); then
    warning "⚠️  Memória acima de 80%"
fi

# CPU
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
log "⚙️  CPU: ${CPU_USAGE}%"

# Processos
PROCESS_COUNT=$(docker exec metaiq-backend ps aux | wc -l)
log "🔄 Processos no backend: $PROCESS_COUNT"

# Status final
log "─────────────────────────────────────"
if [ "$STATUS_OK" = true ]; then
    success "✅ Todos os serviços estão OPERACIONAIS"
    exit 0
else
    error "❌ Alguns serviços estão com PROBLEMAS"
    exit 1
fi
