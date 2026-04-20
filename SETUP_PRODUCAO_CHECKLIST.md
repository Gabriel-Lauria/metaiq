# 📋 Checklist de Setup - Produção MetaIQ

## Pré-Deploy Checklist

### Infraestrutura & Servidor
- [ ] Servidor preparado (Ubuntu 22.04 LTS ou similar)
- [ ] Docker instalado e testado
- [ ] Docker Compose instalado (v20+)
- [ ] Git instalado
- [ ] 50GB SSD disponível
- [ ] 4GB+ RAM
- [ ] 2+ CPUs
- [ ] Acesso root ou sudo configurado

### Domínios & DNS
- [ ] Domínios registrados (app.seudominio.com.br, api.seudominio.com.br)
- [ ] Registros DNS apontando para servidor
- [ ] DNS propagado (testar com `nslookup` ou `dig`)
- [ ] TTL baixo configurado para alterações rápidas

### SSL/TLS
- [ ] Certificados SSL gerados (Let's Encrypt ou CA)
- [ ] Certificados válidos por pelo menos 30 dias
- [ ] Auto-renovação configurada (certbot)
- [ ] Testes SSL passando (https://www.ssllabs.com)

### Variáveis de Ambiente
- [ ] `.env.prod` criado com base em `.env.prod.template`
- [ ] JWT_SECRET gerado e alterado (48+ chars)
- [ ] JWT_REFRESH_SECRET gerado e alterado
- [ ] CRYPTO_SECRET gerado e alterado (32+ chars)
- [ ] POSTGRES_PASSWORD alterado
- [ ] REDIS_PASSWORD alterado
- [ ] META_APP_ID e META_APP_SECRET configurados
- [ ] GEMINI_API_KEY configurado
- [ ] PLATFORM_ADMIN_EMAIL e PASSWORD alterados
- [ ] SMTP configurado para envio de emails
- [ ] Arquivo .env.prod com permissões 600 (chmod 600 .env.prod)
- [ ] .env.prod adicionado ao .gitignore

### Aplicação
- [ ] Backend build testado localmente
- [ ] Frontend build testado localmente
- [ ] Migrations preparadas e testadas
- [ ] Seed data (se necessário) preparado
- [ ] Health check endpoint funcionando

### Segurança
- [ ] Firewall configurado (apenas 80, 443 públicos)
- [ ] SSH key-based auth configurado
- [ ] Sem acesso password SSH
- [ ] Todos os secrets em variáveis de ambiente
- [ ] Sem secrets no git
- [ ] Headers de segurança no Nginx
- [ ] CORS configurado corretamente
- [ ] Rate limiting ativo

### Monitoramento & Logs
- [ ] Diretórios `/opt/metaiq/logs` criados
- [ ] Diretórios `/opt/metaiq/backups` criados
- [ ] Rotação de logs configurada
- [ ] Scripts de health check criados
- [ ] Cron job de backup agendado (diariamente)
- [ ] Cron job de health check agendado (a cada 5 min)

### Backup & Recovery
- [ ] Backup inicial realizado e testado
- [ ] Procedimento de restauração testado
- [ ] S3/armazenamento externo configurado (opcional)
- [ ] Retenção de backups definida (30 dias)

### Documentação
- [ ] Senhas compartilhadas com equipe (gestor de senhas)
- [ ] Runbook de troubleshooting criado
- [ ] Procedimento de rollback documentado
- [ ] Contatos de suporte definidos
- [ ] Procedimentos de incident response definidos

---

## Deploy Day Checklist

### Antes do Deploy
- [ ] Backup do banco criado e testado
- [ ] Equipe notificada
- [ ] Janela de manutenção comunicada aos usuários
- [ ] Rollback plan revisado
- [ ] Team em standby

### Durante o Deploy
- [ ] Deploy script executado: `bash /opt/metaiq/scripts/deploy.sh`
- [ ] Migrations rodadas com sucesso
- [ ] Health checks passando
- [ ] Logs verificados (sem erros críticos)
- [ ] Frontend carregando corretamente
- [ ] Backend respondendo às requisições
- [ ] Database conectado e funcionando
- [ ] Redis cache funcionando

### Após o Deploy
- [ ] Testes manuais da funcionalidade principal
- [ ] Login funcionando
- [ ] Integração Meta/Facebook testada
- [ ] Exportação de relatórios testada
- [ ] Email notifications testadas
- [ ] Monitoramento ativo verificado
- [ ] Backups continuam sendo feitos
- [ ] Notificação de sucesso para equipe

---

## Operações Diárias

### Monitoramento
```bash
# Verificar saúde
bash /opt/metaiq/scripts/health-check.sh

# Ver logs em tempo real
docker logs -f metaiq-backend
docker logs -f metaiq-postgres

# Verificar espaço em disco
df -h

# Verificar memória
free -h
```

### Backup Manual
```bash
bash /opt/metaiq/scripts/backup.sh
```

### Verificar Status
```bash
cd /opt/metaiq
docker-compose -f docker-compose.prod.yml ps
```

---

## Troubleshooting Common Issues

### Serviço X não sobe
```bash
# Ver logs detalhados
docker logs metaiq-backend

# Reiniciar container específico
docker restart metaiq-backend

# Verificar se porta está em uso
lsof -i :3004
```

### Database connection error
```bash
# Testar conexão
docker exec metaiq-postgres psql -U metaiq_prod_user -d metaiq_prod -c "SELECT 1"

# Ver logs do postgres
docker logs metaiq-postgres
```

### Certificado SSL expirado
```bash
# Renovar automaticamente
sudo certbot renew

# Copiar para nginx
sudo cp /etc/letsencrypt/live/app.seudominio.com.br/fullchain.pem /opt/metaiq/nginx/ssl/

# Reiniciar nginx
docker restart metaiq-nginx
```

---

## Escalabilidade Futura

Quando precisar escalar:
- [ ] Configurar Redis persistência
- [ ] Setup replicação PostgreSQL (standby)
- [ ] Load balancer para múltiplos backends
- [ ] CDN para assets estáticos
- [ ] Kubernetes migration (se necessário)

---

**Versão**: 1.0  
**Última atualização**: Abril 2026  
**Responsável**: DevOps Team
