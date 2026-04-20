# 🎬 Guia de Início - Passo a Passo Visual

## Timeline Estimado: 90-120 minutos

```
Preparação   │ Setup          │ Deploy      │ Validação   │ Finalização
(10 min)     │ (40 min)       │ (20 min)    │ (10 min)    │ (15 min)
             │                │             │             │
1. DNS      → 2. Docker     → 3. Build   → 4. Testes  → 5. Produção
2. SSL      → 3. Secrets    → 3. Migrate → 4. Health  → 5. Backup
3. Creds    → 3. Files      → 3. Seed    → 4. Login   → 5. Monitor
```

---

## 📍 Passo 1: Preparação do Servidor (15 min)

### Pré-requisitos
```
✓ Servidor Linux (Ubuntu 22.04 LTS)
✓ 4GB RAM, 2+ CPU, 50GB SSD
✓ Acesso SSH com chave
✓ Domínios registrados e apontando para servidor
```

### Comandos
```bash
# 1.1 - Conectar ao servidor
ssh ubuntu@seu-servidor.com

# 1.2 - Atualizar sistema
sudo apt-get update && sudo apt-get upgrade -y

# 1.3 - Instalar Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

# 1.4 - Verificar
docker --version
```

### ✅ Checklist
- [ ] SSH funcionando
- [ ] Pacotes atualizados
- [ ] Docker instalado
- [ ] User adicionado ao grupo docker

---

## 🔐 Passo 2: Configuração de Segurança (20 min)

### 2.1 - Certificados SSL
```bash
# Instalar Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Gerar certificado (substitua seu domínio)
sudo certbot certonly --standalone \
  -d app.seudominio.com.br \
  -d api.seudominio.com.br

# Copiar para projeto
mkdir -p /opt/metaiq/nginx/ssl
sudo cp /etc/letsencrypt/live/app.seudominio.com.br/fullchain.pem /opt/metaiq/nginx/ssl/
sudo cp /etc/letsencrypt/live/app.seudominio.com.br/privkey.pem /opt/metaiq/nginx/ssl/
sudo chown -R $USER:$USER /opt/metaiq/nginx/ssl/
```

### 2.2 - Variáveis de Ambiente
```bash
# Gerar secrets seguros
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
# Saída exemplo: JWT_SECRET=a1b2c3d4e5f6...

# Copiar template
cd /opt/metaiq
cp .env.prod.template .env.prod

# Editar com segurança
nano .env.prod
```

### 📝 O Que Alterar em `.env.prod`
```env
# DOMÍNIOS
FRONTEND_URL=https://app.seudominio.com.br   # ← Seu domínio
BACKEND_URL=https://api.seudominio.com.br    # ← Seu domínio

# BANCO DE DADOS
POSTGRES_PASSWORD=SuaSenhaForte123@#$%       # ← Senha forte

# REDIS
REDIS_PASSWORD=OutraSenhaForte456@#$%       # ← Outra senha

# SECRETS (Use o node acima)
JWT_SECRET=a1b2c3d4e5f6...                  # ← Do comando node
CRYPTO_SECRET=x9y8z7...                     # ← Do comando node

# META/FACEBOOK
META_APP_ID=seu_id_aqui                     # ← Do Facebook
META_APP_SECRET=seu_secret_aqui             # ← Do Facebook

# ADMIN INITIAL
PLATFORM_ADMIN_EMAIL=seu-email@seudominio.com
PLATFORM_ADMIN_PASSWORD=SenhaTemporaria123@ # ← Mudar após login
```

### 🔒 Proteger Arquivo
```bash
chmod 600 /opt/metaiq/.env.prod
# Confirmado: Apenas você pode ler
```

### ✅ Checklist
- [ ] Certificados copiados para `/opt/metaiq/nginx/ssl/`
- [ ] `.env.prod` criado e protegido (chmod 600)
- [ ] Todos os valores _IMPORTANTES_ alterados
- [ ] Nenhum secret no git

---

## 🏗️ Passo 3: Deploy da Aplicação (30 min)

### 3.1 - Preparar Repositório
```bash
# Clonar ou atualizar
cd /opt/metaiq
git clone https://seu-repo.git . 2>/dev/null || git pull

# Verificar que temos todos os arquivos
ls -la docker-compose.prod.yml     # ✓
ls -la nginx/nginx.conf             # ✓
ls -la metaiq-backend/Dockerfile.prod  # ✓
ls -la metaiq-frontend/Dockerfile.prod # ✓
```

### 3.2 - Build (⏳ 5-10 minutos, seja paciente!)
```bash
docker-compose -f docker-compose.prod.yml build --no-cache

# Esperado: 
# Successfully built xxxxx
# Successfully tagged metaiq_frontend:latest
# Successfully tagged metaiq_backend:latest
```

### 3.3 - Iniciar Serviços
```bash
docker-compose -f docker-compose.prod.yml up -d

# Verificar status
docker-compose -f docker-compose.prod.yml ps

# Esperado:
# NAME                 STATUS
# metaiq-postgres      Up (healthy)
# metaiq-redis         Up (healthy)
# metaiq-backend       Up (starting)
# metaiq-frontend      Up
# metaiq-nginx         Up
```

### 3.4 - Aguardar Serviços (⏳ 2 minutos)
```bash
sleep 120

# Ver logs para verificar tudo bem
docker logs metaiq-backend | tail -20

# Esperado: Sem erros, algo como:
# [Nest] ... NestJS application started
```

### 3.5 - Executar Migrations (Banco de Dados)
```bash
docker-compose -f docker-compose.prod.yml run --rm backend npm run migration:run

# Esperado: 
# Migration XXX executed successfully
# Successfully executed all migrations
```

### ✅ Checklist
- [ ] Build completou sem erros
- [ ] Todos os containers em estado "Up"
- [ ] Logs do backend sem erros críticos
- [ ] Migrations executadas

---

## ✔️ Passo 4: Validação (10 min)

### 4.1 - Testar API
```bash
# Teste 1: Health Check
curl -i https://api.seudominio.com.br/api/health

# Esperado HTTP 200:
# {"status":"ok"}
```

### 4.2 - Testar Frontend
```bash
# Teste 2: Página inicial
curl -i https://app.seudominio.com.br

# Esperado HTTP 200 com HTML
```

### 4.3 - Testar Database
```bash
# Teste 3: Conectar ao banco
docker exec metaiq-postgres psql \
  -U metaiq_prod_user -d metaiq_prod \
  -c "SELECT version();"

# Esperado: Versão do PostgreSQL
```

### 4.4 - Health Check Completo
```bash
bash /opt/metaiq/scripts/health-check.sh

# Esperado: ✅ Todos os serviços OK
```

### 4.5 - Login Manual (Importante!)
1. Abra: https://app.seudominio.com.br
2. Faça login com as credenciais criadas em `.env.prod`
   - Email: `seu-email@seudominio.com`
   - Senha: `SenhaTemporaria123@`
3. Altere a senha imediatamente

### ✅ Checklist
- [ ] API responde em https://api.seudominio.com.br
- [ ] Frontend carrega em https://app.seudominio.com.br
- [ ] Login funciona
- [ ] Health check passa

---

## 📅 Passo 5: Operacionalização (15 min)

### 5.1 - Agendar Backup Automático
```bash
# Editar crontab
crontab -e

# Adicionar esta linha (backup todos os dias às 02:00 AM)
0 2 * * * /opt/metaiq/scripts/backup.sh >> /opt/metaiq/logs/cron-backup.log 2>&1
```

### 5.2 - Agendar Health Check
```bash
# Adicionar também ao crontab:
# (a cada 5 minutos)
*/5 * * * * /opt/metaiq/scripts/health-check.sh >> /opt/metaiq/logs/cron-health.log 2>&1
```

### 5.3 - Teste de Backup
```bash
# Fazer backup manual
bash /opt/metaiq/scripts/backup.sh

# Verificar arquivo criado
ls -lh /opt/metaiq/backups/ | head -1

# Esperado: backup_20250420_143002.sql.gz (alguns MB)
```

### 5.4 - Teste de Restauração (Importante!)
```bash
# Fazer backup antes do teste
BACKUP_FILE="/opt/metaiq/backups/backup_20250420_143002.sql.gz"

# Restaurar (isso irá sobrescrever o banco)
zcat "$BACKUP_FILE" | docker exec -i metaiq-postgres psql \
  -U metaiq_prod_user -d metaiq_prod

# ✅ Se rodou sem erro, está tudo bem!
```

### 5.5 - Documentação
```bash
# Criar arquivo de referência
cat > /opt/metaiq/PRODUCAO_INFO.txt << 'EOF'
═══════════════════════════════════════════
MetaIQ - Informações de Produção
═══════════════════════════════════════════

Domínios:
  Frontend: https://app.seudominio.com.br
  API:      https://api.seudominio.com.br

Diretórios:
  Projeto:   /opt/metaiq/
  Logs:      /opt/metaiq/logs/
  Backups:   /opt/metaiq/backups/
  Scripts:   /opt/metaiq/scripts/

Comandos Úteis:
  Ver logs:  docker logs -f metaiq-backend
  Status:    docker-compose -f /opt/metaiq/docker-compose.prod.yml ps
  Restart:   docker restart metaiq-backend
  Health:    bash /opt/metaiq/scripts/health-check.sh

Backups:
  Automático: Diariamente às 02:00 AM
  Manual:     bash /opt/metaiq/scripts/backup.sh
  Restaurar:  zcat backup.sql.gz | docker exec -i metaiq-postgres psql ...

Monitoramento:
  Health Check: A cada 5 minutos (cron)
  Logs: /opt/metaiq/logs/

Data de Deploy: $(date)
═══════════════════════════════════════════
EOF

# Fazer backup disso também
cp /opt/metaiq/PRODUCAO_INFO.txt /opt/metaiq/backups/PRODUCAO_INFO.txt
```

### ✅ Checklist
- [ ] Backup automático agendado
- [ ] Health check agendado
- [ ] Backup manual testado
- [ ] Restauração testada
- [ ] Informações documentadas
- [ ] Senhas em gestor seguro (LastPass, 1Password, etc)

---

## 🎉 Você Conseguiu!

### Status Final
```
✅ Aplicação em produção
✅ SSL/HTTPS ativo
✅ Database funcionando
✅ Backups automáticos
✅ Monitoramento ativo
✅ Tudo documentado
```

### Próximas Ações
1. **Imediato**
   - [ ] Comunicar ao time
   - [ ] Monitorar logs por 24h
   - [ ] Testar com alguns usuários
   
2. **Próxima Semana**
   - [ ] Revisar logs e performance
   - [ ] Implementar alertas (Slack, Email)
   - [ ] Documentar procedures
   - [ ] Treinar equipe

3. **Futuro**
   - [ ] Considerar CDN para assets
   - [ ] Setup monitoring avançado
   - [ ] Planejar scaling

---

## 📞 Troubleshooting Rápido

### Backend não responde
```bash
# Ver erro
docker logs metaiq-backend | grep -i error

# Reiniciar
docker restart metaiq-backend

# Aguardar 30s e testar
sleep 30
curl https://api.seudominio.com.br/api/health
```

### Frontend mostra erro
```bash
# Verificar build
docker logs metaiq-frontend | tail -50

# Limpar cache (abra DevTools: Ctrl+Shift+Delete)
# Ou acesse: https://app.seudominio.com.br?cache-bust=$(date +%s)
```

### Certificado SSL expirou
```bash
# Renovar
sudo certbot renew

# Copiar
sudo cp /etc/letsencrypt/live/*/fullchain.pem /opt/metaiq/nginx/ssl/

# Reiniciar nginx
docker restart metaiq-nginx
```

---

## 📊 Sumário Visual

```
┌─────────────────────────────────────────┐
│   MetaIQ em Produção - Status Final     │
├─────────────────────────────────────────┤
│ Frontend:    ✅ https://app.*            │
│ Backend API: ✅ https://api.*            │
│ Database:    ✅ PostgreSQL (Local)       │
│ Cache:       ✅ Redis                    │
│ SSL/TLS:     ✅ Let's Encrypt            │
│ Backups:     ✅ Automático (02:00 AM)    │
│ Monitoring:  ✅ Health Check (5 min)     │
│ Logs:        ✅ Estruturado              │
│ Security:    ✅ Rate limit + Headers     │
│ Uptime:      ✅ Pronto!                  │
└─────────────────────────────────────────┘
```

---

**Tempo Total**: ~90-120 minutos  
**Dificuldade**: ⭐⭐ (Moderado - seguindo este guia)  
**Sucesso esperado**: 99% (Se seguir todos os passos)

Bom sorte! 🚀
