# 🚀 Guia de Deployment - MetaIQ em Produção

## 📋 Índice
1. [Pré-requisitos](#pré-requisitos)
2. [Arquitetura Recomendada](#arquitetura-recomendada)
3. [Configuração de Infraestrutura](#configuração-de-infraestrutura)
4. [Variáveis de Ambiente](#variáveis-de-ambiente)
5. [Certificados SSL](#certificados-ssl)
6. [Deploy com Docker](#deploy-com-docker)
7. [Configuração do Banco de Dados](#configuração-do-banco-de-dados)
8. [Monitoramento e Logs](#monitoramento-e-logs)
9. [Backup e Recuperação](#backup-e-recuperação)
10. [Checklist de Segurança](#checklist-de-segurança)

---

## ✅ Pré-requisitos

### Softwares Necessários
- **Docker & Docker Compose** (v20+)
- **Node.js** (v18+ para build)
- **Git**
- **PostgreSQL CLI** (para administração)
- **SSL Certificate** (Let's Encrypt ou CA corporativa)

### Servidor
- **CPU**: Mínimo 2 cores (recomendado 4)
- **RAM**: Mínimo 4GB (recomendado 8GB)
- **Armazenamento**: SSD com 50GB (para banco de dados e uploads)
- **SO**: Ubuntu 22.04 LTS ou similar Linux

---

## 🏗️ Arquitetura Recomendada

```
┌─────────────────────────────────────────────────────────┐
│                    Internet (HTTPS)                      │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
   ┌─────────┐                  ┌─────────┐
   │ Nginx   │                  │  CDN    │
   │ (Proxy) │                  │ (Assets)│
   └────┬────┘                  └─────────┘
        │
   ┌────┴─────────────────┐
   │  Docker Compose      │
   │  ┌───────────┐       │
   │  │ Backend   │       │
   │  │ (NestJS)  │       │
   │  └─────┬─────┘       │
   │  ┌─────┴────────┐    │
   │  │ Frontend     │    │
   │  │ (Nginx+Ang)  │    │
   │  └──────────────┘    │
   └────────┬─────────────┘
            │
      ┌─────┴──────┐
      ▼            ▼
   ┌────────┐  ┌───────────┐
   │Postgre │  │ Redis     │
   │SQL     │  │ (cache)   │
   └────────┘  └───────────┘
```

---

## 🔧 Configuração de Infraestrutura

### 1. Preparar Servidor Ubuntu

```bash
# Atualizar sistema
sudo apt-get update && sudo apt-get upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Instalar ferramentas utilitárias
sudo apt-get install -y git curl wget nginx certbot python3-certbot-nginx

# Criar diretórios
mkdir -p /opt/metaiq
mkdir -p /opt/metaiq/backups
mkdir -p /opt/metaiq/logs
```

### 2. Clonar Repositório

```bash
cd /opt/metaiq
git clone https://github.com/seu-usuario/metaiq.git .
git checkout main  # ou sua branch principal
```

### 3. Estrutura de Diretórios Recomendada

```
/opt/metaiq/
├── docker-compose.prod.yml          # Compose para produção
├── metaiq-backend/
├── metaiq-frontend/
├── nginx/                           # Configuração Nginx
│   ├── nginx.conf
│   └── ssl/                         # Certificados
├── env/
│   ├── .env.prod                    # Variáveis de produção
│   └── .env.backup                  # Backup (não commitar)
├── logs/                            # Logs da aplicação
├── backups/                         # Backups do banco
└── scripts/
    ├── deploy.sh
    ├── backup.sh
    └── health-check.sh
```

---

## 🔐 Variáveis de Ambiente

### Gerar Secrets Seguros

```bash
# Gerar 3 secrets diferentes (128 chars cada)
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('CRYPTO_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

### Arquivo `.env.prod` (Exemplo)

```env
# ─── Environment ──────────────────────
NODE_ENV=production
PORT=3004
LOG_LEVEL=info

# ─── URL Pública ───────────────────────
FRONTEND_URL=https://app.seudominio.com.br
BACKEND_URL=https://api.seudominio.com.br

# ─── PostgreSQL ─────────────────────────
# Nunca usar valores padrão em produção!
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=metaiq_prod_user
POSTGRES_PASSWORD=ChangeMe!@#$%^&*1234567890
POSTGRES_DB=metaiq_prod
POSTGRES_SSL=true
POSTGRES_POOL_MIN=5
POSTGRES_POOL_MAX=20

# ─── JWT Secrets (Gerar com node acima) ─
JWT_SECRET=your_jwt_secret_here_min_48_chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your_refresh_secret_here_min_48_chars
JWT_REFRESH_EXPIRES_IN=7d

# ─── Crypto ─────────────────────────────
CRYPTO_SECRET=your_crypto_secret_here_min_32_chars

# ─── Meta/Facebook OAuth ────────────────
META_APP_ID=seu_app_id_prod
META_APP_SECRET=seu_app_secret_prod
META_REDIRECT_URI=https://api.seudominio.com.br/api/integrations/meta/oauth/callback
META_API_VERSION=v19.0
META_OAUTH_SCOPES=ads_read,ads_management,business_management,pages_show_list,pages_read_engagement
AUTH_ENABLE_DEV_META_CONNECT=false

# ─── Gemini AI ───────────────────────
GEMINI_API_KEY=sua_chave_prod
GEMINI_MODEL=gemini-2.5-flash

# ─── Email (Para notificações) ─────────
SMTP_HOST=seu-smtp.com
SMTP_PORT=587
SMTP_USER=seu-usuario
SMTP_PASSWORD=sua-senha
SMTP_FROM=noreply@seudominio.com

# ─── Platform Admin (Não incluir em git!) ─
PLATFORM_ADMIN_EMAIL=admin@seudominio.com
PLATFORM_ADMIN_PASSWORD=MudieIstoNoPrimeiroDeploy!@#

# ─── Redis (Opcional - para cache/sessions) ─
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=seu_redis_password_seguro

# ─── Timezone ────────────────────────
TZ=America/Sao_Paulo
```

### Proteger o Arquivo

```bash
# Somente o usuário pode ler
chmod 600 /opt/metaiq/.env.prod

# Não commitar no git
echo ".env.prod" >> /opt/metaiq/.gitignore
```

---

## 🔒 Certificados SSL

### Opção 1: Let's Encrypt (Gratuito)

```bash
# Instalar Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Gerar certificado
sudo certbot certonly --standalone -d app.seudominio.com.br -d api.seudominio.com.br

# Copiar para diretório do projeto
sudo cp /etc/letsencrypt/live/app.seudominio.com.br/fullchain.pem /opt/metaiq/nginx/ssl/
sudo cp /etc/letsencrypt/live/app.seudominio.com.br/privkey.pem /opt/metaiq/nginx/ssl/
sudo chown -R $USER:$USER /opt/metaiq/nginx/ssl/

# Renovação automática (cron job)
# Editar: sudo crontab -e
0 3 * * * certbot renew --quiet && docker restart metaiq-nginx
```

### Opção 2: Certificado CA Corporativa

```bash
# Se sua empresa usa SSL interno
# Copiar certificado e chave para:
/opt/metaiq/nginx/ssl/cert.pem
/opt/metaiq/nginx/ssl/key.pem
```

---

## 🐳 Docker Compose para Produção

### Arquivo: `docker-compose.prod.yml`

```yaml
version: '3.9'

services:
  # ─────────────────────────────────────
  # PostgreSQL - Banco de Dados Principal
  # ─────────────────────────────────────
  postgres:
    image: postgres:16-alpine
    container_name: metaiq-postgres
    restart: always
    
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_INITDB_ARGS: "-c shared_buffers=256MB -c max_connections=200"
    
    volumes:
      - metaiq-postgres-data:/var/lib/postgresql/data
      - ./backups:/backups
    
    ports:
      - "127.0.0.1:5432:5432"  # Apenas localhost
    
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    
    networks:
      - metaiq-network
    
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  # ─────────────────────────────────────
  # Redis - Cache e Session Storage
  # ─────────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: metaiq-redis
    restart: always
    
    command: redis-server --requirepass ${REDIS_PASSWORD} --maxmemory 512mb --maxmemory-policy allkeys-lru
    
    volumes:
      - metaiq-redis-data:/data
    
    ports:
      - "127.0.0.1:6379:6379"  # Apenas localhost
    
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    
    networks:
      - metaiq-network
    
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  # ─────────────────────────────────────
  # Backend NestJS API
  # ─────────────────────────────────────
  backend:
    build:
      context: ./metaiq-backend
      dockerfile: Dockerfile.prod
    
    container_name: metaiq-backend
    restart: always
    
    env_file: .env.prod
    
    environment:
      POSTGRES_HOST: postgres
      REDIS_HOST: redis
    
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    
    ports:
      - "127.0.0.1:3004:3004"  # Apenas localhost (atrás do Nginx)
    
    volumes:
      - ./metaiq-backend/uploads:/app/uploads
      - ./logs/backend:/app/logs
    
    networks:
      - metaiq-network
    
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3004/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"

  # ─────────────────────────────────────
  # Frontend Angular (Nginx)
  # ─────────────────────────────────────
  frontend:
    build:
      context: ./metaiq-frontend
      dockerfile: Dockerfile.prod
    
    container_name: metaiq-frontend
    restart: always
    
    ports:
      - "127.0.0.1:3000:80"  # Apenas localhost
    
    volumes:
      - ./nginx/nginx-frontend.conf:/etc/nginx/nginx.conf:ro
    
    networks:
      - metaiq-network
    
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80/"]
      interval: 30s
      timeout: 10s
      retries: 3
    
    logging:
      driver: "json-file"
      options:
        max-size: "20m"
        max-file: "3"

  # ─────────────────────────────────────
  # Nginx - Reverse Proxy com SSL
  # ─────────────────────────────────────
  nginx:
    image: nginx:alpine
    container_name: metaiq-nginx
    restart: always
    
    ports:
      - "80:80"
      - "443:443"
    
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./logs/nginx:/var/log/nginx
    
    depends_on:
      - backend
      - frontend
    
    networks:
      - metaiq-network
    
    logging:
      driver: "json-file"
      options:
        max-size: "20m"
        max-file: "5"

networks:
  metaiq-network:
    driver: bridge

volumes:
  metaiq-postgres-data:
    driver: local
  metaiq-redis-data:
    driver: local
```

---

## 🗄️ Configuração do Banco de Dados

### 1. Backup Automático (Script)

Criar arquivo: `/opt/metaiq/scripts/backup.sh`

```bash
#!/bin/bash

BACKUP_DIR="/opt/metaiq/backups"
DB_NAME="metaiq_prod"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.sql.gz"

echo "🔄 Iniciando backup..."

# Executar backup
docker exec metaiq-postgres pg_dump -U metaiq_prod_user metaiq_prod | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Backup criado: $BACKUP_FILE"
    
    # Manter apenas os últimos 30 backups
    find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete
    
    # Upload para S3 (opcional)
    # aws s3 cp "$BACKUP_FILE" "s3://seu-bucket-backups/"
else
    echo "❌ Erro ao criar backup"
    exit 1
fi
```

### 2. Agendar Backup (Cron)

```bash
# Editar crontab
crontab -e

# Adicionar linha (backup diário às 02:00 AM)
0 2 * * * /opt/metaiq/scripts/backup.sh >> /opt/metaiq/logs/cron-backup.log 2>&1
```

### 3. Restaurar Backup

```bash
# Em caso de necessidade
BACKUP_FILE="/opt/metaiq/backups/backup_20250420_020000.sql.gz"
zcat "$BACKUP_FILE" | docker exec -i metaiq-postgres psql -U metaiq_prod_user -d metaiq_prod
```

---

## 📊 Monitoramento e Logs

### 1. Estrutura de Logs

```bash
mkdir -p /opt/metaiq/logs/{backend,frontend,nginx,database}
chmod 755 /opt/metaiq/logs
```

### 2. Visualizar Logs em Tempo Real

```bash
# Backend
docker logs -f metaiq-backend

# Frontend
docker logs -f metaiq-frontend

# Banco de Dados
docker logs -f metaiq-postgres

# Nginx
docker logs -f metaiq-nginx

# Todos
docker-compose -f docker-compose.prod.yml logs -f
```

### 3. Health Check Script

Criar: `/opt/metaiq/scripts/health-check.sh`

```bash
#!/bin/bash

echo "🏥 Verificando saúde do sistema..."

# Backend
curl -s http://localhost:3004/api/health && echo "✅ Backend OK" || echo "❌ Backend DOWN"

# Frontend
curl -s http://localhost:3000 > /dev/null && echo "✅ Frontend OK" || echo "❌ Frontend DOWN"

# PostgreSQL
docker exec metaiq-postgres pg_isready -U metaiq_prod_user && echo "✅ DB OK" || echo "❌ DB DOWN"

# Redis
docker exec metaiq-redis redis-cli ping && echo "✅ Redis OK" || echo "❌ Redis DOWN"

# Espaço em disco
DISK=$(df -h / | awk 'NR==2 {print $5}')
echo "💾 Uso de disco: $DISK"
```

### 4. Agendar Health Check

```bash
# Executar a cada 5 minutos
*/5 * * * * /opt/metaiq/scripts/health-check.sh >> /opt/metaiq/logs/health-check.log 2>&1
```

---

## 🔄 Processo de Deploy

### 1. Script de Deploy Automatizado

Criar: `/opt/metaiq/scripts/deploy.sh`

```bash
#!/bin/bash

set -e  # Parar em qualquer erro

REPO_DIR="/opt/metaiq"
BACKUP_DIR="$REPO_DIR/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

echo "🚀 Iniciando deploy..."

# Fazer backup do banco antes de deploy
echo "📦 Fazendo backup..."
docker exec metaiq-postgres pg_dump -U metaiq_prod_user metaiq_prod | gzip > "$BACKUP_DIR/pre-deploy_${TIMESTAMP}.sql.gz"

# Atualizar código
echo "📥 Atualizando repositório..."
cd $REPO_DIR
git fetch origin
git pull origin main

# Rebuild das imagens
echo "🔨 Fazendo build das imagens Docker..."
docker-compose -f docker-compose.prod.yml build --no-cache

# Fazer migrations
echo "🗄️ Executando migrations..."
docker-compose -f docker-compose.prod.yml run --rm backend npm run migration:run

# Restart dos serviços
echo "🔄 Reiniciando serviços..."
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d

# Aguardar serviços ficarem prontos
echo "⏳ Aguardando serviços..."
sleep 15

# Verificar saúde
echo "🏥 Verificando saúde..."
bash $REPO_DIR/scripts/health-check.sh

echo "✅ Deploy concluído com sucesso!"
```

### 2. Fazer Deploy

```bash
chmod +x /opt/metaiq/scripts/deploy.sh
/opt/metaiq/scripts/deploy.sh
```

---

## 🛡️ Segurança - Checklist

- [ ] **Secrets**: Todos os secrets gerados e armazenados em `.env.prod` (não no git)
- [ ] **SSL/TLS**: Certificados instalados e HTTPS ativo
- [ ] **Firewall**: Apenas portas 80 e 443 abertas publicamente
- [ ] **Database**: Acesso apenas via localhost (não exposto)
- [ ] **Redis**: Senha forte e acesso apenas via localhost
- [ ] **Nginx**: Headers de segurança configurados
- [ ] **Updates**: Sistema operacional atualizado
- [ ] **Backups**: Teste de restauração realizado
- [ ] **Logs**: Monitoramento ativo de logs
- [ ] **Rate Limiting**: Configurado no Nginx
- [ ] **CORS**: Apenas domínios permitidos
- [ ] **Admin Access**: SSH com chaves, sem password
- [ ] **Monitoring**: Alertas configurados

### Configuração Nginx Segura (nginx.conf)

```nginx
# Remover versão do Nginx
server_tokens off;

# Headers de segurança
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

# HSTS (HTTP Strict Transport Security)
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# Rate limiting
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;

server {
    listen 443 ssl http2;
    server_name api.seudominio.com.br;
    
    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    
    # Configurações SSL modernas
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Rate limiting para login
    location /api/auth/login {
        limit_req zone=login_limit burst=5;
        proxy_pass http://backend:3004;
    }
    
    # Rate limiting geral
    location /api/ {
        limit_req zone=api_limit burst=20;
        proxy_pass http://backend:3004;
    }
}
```

---

## 📈 Scaling (Quando Necessário)

### Opção 1: Horizontal Scaling com Load Balancer

```yaml
# Adicionar múltiplas instâncias de backend
backend1:
  # configurações...

backend2:
  # configurações...

backend3:
  # configurações...

# Nginx distribui carga
upstream backend_pool {
  server backend1:3004;
  server backend2:3004;
  server backend3:3004;
}
```

### Opção 2: Kubernetes (Clusters)

Para alta disponibilidade, considere migrar para Kubernetes (K8s).

---

## ✅ Checklist de Preparação

- [ ] Servidor preparado e testado
- [ ] Domínios DNS configurados
- [ ] SSL configurado
- [ ] Variáveis de ambiente (`env.prod`) criadas
- [ ] Secrets gerados (JWT, Crypto, etc.)
- [ ] Backup inicial realizado
- [ ] Docker images buildadas
- [ ] Migrations testadas
- [ ] Health checks implementados
- [ ] Logs configurados
- [ ] Monitoramento ativo
- [ ] Procedimento de rollback testado
- [ ] Equipe notificada

---

## 🚨 Troubleshooting

### Backend não conecta ao banco

```bash
# Verificar conectividade
docker exec metaiq-backend curl -f http://postgres:5432 || echo "Conexão recusada"

# Verificar logs
docker logs metaiq-backend | grep -i postgres
```

### Frontend não carrega

```bash
# Verificar build
docker logs metaiq-frontend

# Testar acesso direto
curl -v http://localhost:3000
```

### SSL expirou

```bash
# Renovar certificado
sudo certbot renew
sudo cp /etc/letsencrypt/live/app.seudominio.com.br/fullchain.pem /opt/metaiq/nginx/ssl/
docker restart metaiq-nginx
```

---

## 📞 Suporte e Documentação

- **Logs**: `/opt/metaiq/logs/`
- **Backups**: `/opt/metaiq/backups/`
- **Repositório**: [GitHub MetaIQ](https://github.com/seu-usuario/metaiq)
- **Documentação**: [Docs](./docs/)

---

**Última atualização**: Abril 2026
**Status**: Pronto para produção
