#!/bin/bash

# ═══════════════════════════════════════════════════════════
# Script de Backup Automático - MetaIQ Production
# ═══════════════════════════════════════════════════════════

set -e

# Configurações
BACKUP_DIR="/opt/metaiq/backups"
DB_NAME="metaiq_prod"
DB_USER="metaiq_prod_user"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.sql.gz"
LOG_FILE="/opt/metaiq/logs/backup.log"

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Criar diretório se não existir
mkdir -p "$BACKUP_DIR"

log "🔄 Iniciando backup do banco de dados..."

# Executar backup
if docker exec metaiq-postgres pg_dump -U "$DB_USER" "$DB_NAME" 2>/dev/null | gzip > "$BACKUP_FILE"; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    success "Backup criado: $(basename $BACKUP_FILE) ($BACKUP_SIZE)"
    
    # Manter apenas os últimos 30 backups (8 semanas)
    log "🧹 Limpando backups antigos..."
    find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +30 -exec rm {} \;
    success "Limpeza concluída"
    
    # Contar backups
    BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null | wc -l)
    log "📊 Total de backups mantidos: $BACKUP_COUNT"
    
    # Upload para S3 (opcional - descomentar se usar)
    # aws s3 cp "$BACKUP_FILE" "s3://seu-bucket-backups/" && success "Upload para S3 concluído"
    
else
    error "Erro ao criar backup"
    exit 1
fi

log "✅ Backup finalizado com sucesso"
