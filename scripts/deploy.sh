#!/bin/bash

# ═══════════════════════════════════════════════════════════
# Script de Deploy Automatizado - MetaIQ Production
# ═══════════════════════════════════════════════════════════

set -e  # Parar em qualquer erro

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configurações
REPO_DIR="/opt/metaiq"
BACKUP_DIR="$REPO_DIR/backups"
LOG_FILE="$REPO_DIR/logs/deploy.log"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Funções
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
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

# Validações iniciais
validate_env() {
    log "🔍 Validando ambiente..."
    
    if ! command -v docker &> /dev/null; then
        error "Docker não está instalado"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose não está instalado"
        exit 1
    fi
    
    if ! command -v git &> /dev/null; then
        error "Git não está instalado"
        exit 1
    fi
    
    if [ ! -f "$REPO_DIR/.env.prod" ]; then
        error "Arquivo .env.prod não encontrado"
        exit 1
    fi
    
    success "Ambiente validado"
}

# Fazer backup do banco antes de deploy
backup_database() {
    log "📦 Fazendo backup do banco de dados..."
    
    mkdir -p "$BACKUP_DIR"
    local backup_file="$BACKUP_DIR/pre-deploy_${TIMESTAMP}.sql.gz"
    
    if docker exec metaiq-postgres pg_dump -U metaiq_prod_user metaiq_prod 2>/dev/null | gzip > "$backup_file"; then
        success "Backup criado: $(basename $backup_file)"
        
        # Manter apenas os últimos 30 backups
        find "$BACKUP_DIR" -name "pre-deploy_*.sql.gz" -mtime +30 -delete
    else
        error "Erro ao criar backup"
        exit 1
    fi
}

# Atualizar código
update_code() {
    log "📥 Atualizando repositório..."
    
    cd "$REPO_DIR"
    
    if ! git fetch origin; then
        error "Erro ao fazer fetch"
        exit 1
    fi
    
    if ! git pull origin main; then
        error "Erro ao fazer pull"
        exit 1
    fi
    
    success "Código atualizado"
}

# Rebuild das imagens
rebuild_images() {
    log "🔨 Fazendo build das imagens Docker..."
    
    cd "$REPO_DIR"
    
    if docker-compose -f docker-compose.prod.yml build --no-cache 2>&1 | tee -a "$LOG_FILE"; then
        success "Build concluído"
    else
        error "Erro durante build"
        exit 1
    fi
}

# Executar migrations
run_migrations() {
    log "🗄️ Executando migrations..."
    
    cd "$REPO_DIR"
    
    if docker-compose -f docker-compose.prod.yml run --rm backend npm run migration:run 2>&1 | tee -a "$LOG_FILE"; then
        success "Migrations executadas"
    else
        error "Erro ao executar migrations"
        exit 1
    fi
}

# Restart dos serviços
restart_services() {
    log "🔄 Reiniciando serviços..."
    
    cd "$REPO_DIR"
    
    docker-compose -f docker-compose.prod.yml down
    docker-compose -f docker-compose.prod.yml up -d
    
    success "Serviços reiniciados"
}

# Aguardar serviços ficarem prontos
wait_services() {
    log "⏳ Aguardando serviços ficarem prontos..."
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if docker-compose -f /opt/metaiq/docker-compose.prod.yml ps | grep -q "Up"; then
            log "Tentativa $((attempt + 1))/$max_attempts - Serviços iniciando..."
            sleep 2
            ((attempt++))
        else
            break
        fi
    done
    
    sleep 15  # Aguardar mais um pouco
    success "Serviços prontos"
}

# Verificar saúde dos serviços
health_check() {
    log "🏥 Verificando saúde dos serviços..."
    
    # Backend
    if curl -sf http://localhost:3004/api/health > /dev/null 2>&1; then
        success "Backend OK"
    else
        error "Backend DOWN"
        return 1
    fi
    
    # Frontend
    if curl -sf http://localhost:3000 > /dev/null 2>&1; then
        success "Frontend OK"
    else
        error "Frontend DOWN"
        return 1
    fi
    
    # PostgreSQL
    if docker exec metaiq-postgres pg_isready -U metaiq_prod_user > /dev/null 2>&1; then
        success "Database OK"
    else
        error "Database DOWN"
        return 1
    fi
    
    # Redis
    if docker exec metaiq-redis redis-cli ping > /dev/null 2>&1; then
        success "Redis OK"
    else
        error "Redis DOWN"
        return 1
    fi
    
    return 0
}

# Rollback em caso de erro
rollback() {
    error "Deploy falhou! Fazendo rollback..."
    
    cd "$REPO_DIR"
    git reset --hard HEAD~1
    
    docker-compose -f docker-compose.prod.yml down
    docker-compose -f docker-compose.prod.yml up -d
    
    error "Rollback concluído"
}

# Main execution
main() {
    log "═══════════════════════════════════════════════════════"
    log "🚀 INICIANDO DEPLOY - MetaIQ Production"
    log "═══════════════════════════════════════════════════════"
    
    validate_env || { rollback; exit 1; }
    backup_database || { rollback; exit 1; }
    update_code || { rollback; exit 1; }
    rebuild_images || { rollback; exit 1; }
    run_migrations || { rollback; exit 1; }
    restart_services || { rollback; exit 1; }
    wait_services || { rollback; exit 1; }
    
    if health_check; then
        log "═══════════════════════════════════════════════════════"
        success "✅ DEPLOY CONCLUÍDO COM SUCESSO!"
        log "═══════════════════════════════════════════════════════"
        exit 0
    else
        error "Health check falhou"
        rollback
        exit 1
    fi
}

# Executar main
main "$@"
