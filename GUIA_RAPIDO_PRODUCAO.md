# 🚀 Guia Rápido - Colocando MetaIQ em Produção

## 5 Passos Principais

### 1️⃣ Preparar Servidor (15 min)

```bash
# SSH para servidor
ssh ubuntu@seu-servidor.com

# Atualizar sistema
sudo apt-get update && sudo apt-get upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verificar instalação
docker --version
docker-compose --version
```

### 2️⃣ Configurar Domínios & SSL (20 min)

```bash
# Criar diretórios
mkdir -p /opt/metaiq/nginx/ssl
cd /opt/metaiq

# Instalar Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Gerar certificado
sudo certbot certonly --standalone \
  -d app.seudominio.com.br \
  -d api.seudominio.com.br

# Copiar certificados
sudo cp /etc/letsencrypt/live/app.seudominio.com.br/fullchain.pem ./nginx/ssl/
sudo cp /etc/letsencrypt/live/app.seudominio.com.br/privkey.pem ./nginx/ssl/
sudo chown -R $USER:$USER ./nginx/ssl/
```

### 3️⃣ Configurar Variáveis de Ambiente (10 min)

```bash
# Copiar template
cp .env.prod.template .env.prod

# Gerar secrets
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('CRYPTO_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# Editar .env.prod com seu editor favorito
nano .env.prod

# Proteger arquivo
chmod 600 .env.prod
```

**O que alterar em `.env.prod`:**
- `FRONTEND_URL` → seu domínio do app
- `BACKEND_URL` → seu domínio da API
- `POSTGRES_PASSWORD` → senha forte
- `REDIS_PASSWORD` → senha forte
- `JWT_SECRET` → resultado do node acima
- `CRYPTO_SECRET` → resultado do node acima
- `META_APP_ID` e `META_APP_SECRET` → suas chaves Meta
- `GEMINI_API_KEY` → sua chave Google
- `PLATFORM_ADMIN_EMAIL` e `PASSWORD` → suas credenciais admin

### 4️⃣ Build & Deploy (30 min)

```bash
# Clonar/atualizar código
cd /opt/metaiq
git clone https://github.com/seu-usuario/metaiq.git . 2>/dev/null || git pull

# Fazer build (espere 5-10 min)
docker-compose -f docker-compose.prod.yml build

# Iniciar serviços
docker-compose -f docker-compose.prod.yml up -d

# Aguardar serviços ficarem prontos (2 min)
sleep 120

# Executar migrations
docker-compose -f docker-compose.prod.yml run --rm backend npm run migration:run

# Verificar status
docker-compose -f docker-compose.prod.yml ps
```

### 5️⃣ Verificar & Agendar (10 min)

```bash
# Testar endpoints
curl https://api.seudominio.com.br/api/health
curl https://app.seudominio.com.br

# Ver logs
docker logs metaiq-backend
docker logs metaiq-frontend
docker logs metaiq-postgres

# Agendar backup diário
crontab -e
# Adicionar: 0 2 * * * /opt/metaiq/scripts/backup.sh >> /opt/metaiq/logs/cron-backup.log 2>&1

# Agendar health check a cada 5 min
# Adicionar: */5 * * * * /opt/metaiq/scripts/health-check.sh >> /opt/metaiq/logs/cron-health.log 2>&1
```

---

## Testes de Validação

### ✅ Testar Backend API

```bash
# Health check
curl -i https://api.seudominio.com.br/api/health

# Esperado: HTTP 200 com {"status":"ok"}
```

### ✅ Testar Frontend

```bash
# Acessar app
curl -i https://app.seudominio.com.br

# Esperado: HTTP 200 com HTML
```

### ✅ Testar Database

```bash
# Conectar ao banco
docker exec metaiq-postgres psql -U metaiq_prod_user -d metaiq_prod -c "SELECT version();"
```

### ✅ Testar Redis

```bash
# Ping
docker exec metaiq-redis redis-cli ping

# Esperado: PONG
```

---

## Comandos Úteis em Produção

```bash
# Ver logs do backend em tempo real
docker logs -f metaiq-backend

# Reiniciar serviço específico
docker restart metaiq-backend

# Parar todos os serviços
docker-compose -f docker-compose.prod.yml down

# Iniciar todos os serviços
docker-compose -f docker-compose.prod.yml up -d

# Executar comando no backend
docker exec metaiq-backend npm run migration:run

# Conectar ao banco via CLI
docker exec -it metaiq-postgres psql -U metaiq_prod_user -d metaiq_prod

# Ver uso de espaço em disco
docker system df

# Fazer backup manual
docker exec metaiq-postgres pg_dump -U metaiq_prod_user metaiq_prod | gzip > /opt/metaiq/backups/manual_backup.sql.gz

# Verificar saúde geral
bash /opt/metaiq/scripts/health-check.sh
```

---

## O Que Fazer Agora?

✅ **Imediato:**
1. [ ] Testar tudo funciona
2. [ ] Fazer backup manual
3. [ ] Testar login com admin
4. [ ] Testar integração Meta
5. [ ] Comunicar ao time

✅ **Próximas 24 horas:**
1. [ ] Monitorar logs
2. [ ] Verificar health check automático
3. [ ] Testar restauração de backup
4. [ ] Documentar issues encontradas
5. [ ] Setup alertas (opcional: Sentry, Slack)

✅ **Próxima semana:**
1. [ ] Fazer teste de failover
2. [ ] Testar rollback procedure
3. [ ] Setup monitoring (Datadog, New Relic, etc)
4. [ ] Documentação de operações
5. [ ] Treinamento de equipe

---

## 🆘 Troubleshooting Rápido

### Backend não responde
```bash
docker logs metaiq-backend | tail -20
docker restart metaiq-backend
```

### Frontend não carrega
```bash
docker logs metaiq-frontend | tail -20
curl -v https://app.seudominio.com.br
```

### Database não conecta
```bash
docker exec metaiq-postgres pg_isready -U metaiq_prod_user
docker logs metaiq-postgres | tail -20
```

### Certificado SSL expirado
```bash
sudo certbot renew
sudo cp /etc/letsencrypt/live/*/fullchain.pem /opt/metaiq/nginx/ssl/
docker restart metaiq-nginx
```

### Sem espaço em disco
```bash
df -h
docker system prune -a  # ⚠️ Use com cuidado
```

---

## 📞 Contatos & Recursos

- **Documentação completa**: [DEPLOYMENT_PRODUCAO.md](./DEPLOYMENT_PRODUCAO.md)
- **Checklist**: [SETUP_PRODUCAO_CHECKLIST.md](./SETUP_PRODUCAO_CHECKLIST.md)
- **Logs**: `/opt/metaiq/logs/`
- **Backups**: `/opt/metaiq/backups/`

---

**Tempo total estimado: ~90 minutos**

Sucesso no seu deployment! 🎉
