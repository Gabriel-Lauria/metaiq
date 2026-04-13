# 🎯 MetaIQ — Plataforma de Inteligência para Meta Ads

Sistema completo de monitoramento e inteligência de campanhas para Meta Ads (Facebook/Instagram).
- **Backend**: NestJS 11 + TypeORM + SQLite
- **Frontend**: Angular 19 + TypeScript + Chart.js
- **Auth**: JWT com refresh tokens + bcrypt
- **Segurança**: Tokens Meta criptografados em AES-256

---

## ⚡ Inicialização Rápida

### 1️⃣ Windows
```bash
start.bat
```

### 2️⃣ Linux/Mac
```bash
chmod +x start.sh
./start.sh
```

### 3️⃣ Manual (todos os OS)
```bash
# Backend
cd metaiq-backend
npm install
cp .env.example .env    # Editar com valores únicos
npm run seed            # Dados de demonstração
npm run start:dev       # http://localhost:3000

# Frontend (outro terminal)
cd metaiq-frontend
npm install
npm start               # http://localhost:4200
```

---

## 🔐 Credenciais de Teste

```
Email:  demo@metaiq.dev
Senha:  Demo@1234
```

---

## 📋 Verificação de Saúde

```bash
node health-check.js
```

Verifica Node.js, npm, .env, dependências e permissões.

---

## 🏗️ Estrutura do Projeto

```
metaiq/
├── metaiq-backend/
│   ├── src/
│   │   ├── modules/              # Lógica de negócio
│   │   │   ├── auth/             JWT + bcrypt
│   │   │   ├── users/            Perfil do usuário
│   │   │   ├── campaigns/        Sincronização
│   │   │   ├── metrics/          CTR, CPA, ROAS
│   │   │   ├── insights/         Regras de negócio
│   │   │   └── meta/             OAuth + Graph API
│   │   ├── common/               Utils, guards, crypto
│   │   └── infrastructure/       Cron jobs
│   ├── .env.example              Configuração
│   ├── seed.ts                   Dados demo
│   └── package.json
│
├── metaiq-frontend/
│   ├── src/app/
│   │   ├── core/
│   │   │   ├── services/         ApiService, AuthService
│   │   │   ├── models.ts         Types compartilhados
│   │   │   └── utils/            FormatUtils, pipes
│   │   └── features/
│   │       ├── auth/             Login + Registro
│   │       ├── dashboard/        KPIs + gráficos
│   │       ├── campaigns/        Tabela com drill-down
│   │       └── accounts/         Contas conectadas
│   ├── environment.ts            Config
│   └── package.json
│
├── start.sh / start.bat          Scripts de inicio
├── health-check.js               Verificação
└── README.md                     Este arquivo
```

---

## 🔧 Configuração

### Backend (.env)

```env
# ── SQLite ────────────────────
SQLITE_PATH=./data/metaiq.db

# ── JWT (gere com node) ────────
# node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=...seu_valor...
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=...outro_valor...
JWT_REFRESH_EXPIRES_IN=7d

# ── AES-256 ───────────────────
CRYPTO_SECRET=...32_caracteres...

# ── Meta / Facebook ───────────
META_APP_ID=seu_app_id
META_APP_SECRET=seu_app_secret
META_API_VERSION=v19.0

# ── App ───────────────────────
PORT=3000
NODE_ENV=development
```

### Frontend (environment.ts)

Já está configurado para:
- API Backend: `http://localhost:3000/api`
- Modo desenvolvimento

---

## 📊 Funcionalidades

### Backend
- ✅ Autenticação JWT com refresh
- ✅ Criptografia de tokens Meta em AES-256
- ✅ Sincronização de campanhas
- ✅ Cálculo de métricas (CTR, CPA, ROAS)
- ✅ 12 regras de negócio para insights
- ✅ Cron job a cada 1 hora
- ✅ Validação de dados com class-validator
- ✅ Testes com Jest

### Frontend
- ✅ Componentes standalone Angular 19
- ✅ Signals para reatividade
- ✅ Gráficos com Chart.js
- ✅ Tabela de campanhas com filtros
- ✅ Dashboard com insights
- ✅ Validação de formulários
- ✅ Interceptor HTTP automático
- ✅ Memory leak fixes com takeUntilDestroyed

---

## 🚀 Scripts Disponíveis

### Backend
```bash
npm run start          # Produção
npm run start:dev      # Desenvolvimento com watch
npm run seed          # Populate dados demo (30 dias)
npm run build         # Build TypeScript
npm run test          # Jest
npm run test:cov      # Coverage
npm run lint          # ESLint + fix
npm run format        # Prettier
```

### Frontend
```bash
npm start             # Dev server com live reload
npm run build         # Build otimizado
npm run test          # Jest
npm run lint          # ESLint
```

---

## 🔗 Conectar Conta Meta Real

1. Acesse [developers.facebook.com](https://developers.facebook.com)
2. Criar novo App → tipo **Business**
3. Adicionar produto: **Marketing API**
4. Em **Settings → Basic**: anotar App ID e App Secret
5. Em **OAuth → Redirect URIs**: adicionar `http://localhost:3000/meta/callback`
6. Editar `.env` com suas credenciais
7. Frontend → Clique em "Conectar com Facebook"
8. O cron job coleta dados a cada hora automaticamente

---

## 🧪 Testes

```bash
# Backend
cd metaiq-backend
npm test              # Todos os testes
npm run test:cov      # Com cobertura

# Frontend (quando adicionados)
cd metaiq-frontend
npm test
```

---

## 📱 APIs Principais

### Auth
- `POST /api/auth/login` — Login
- `POST /api/auth/register` — Registrar
- `POST /api/auth/refresh` — Renovar token

### Campaigns
- `GET /api/campaigns` — Listar
- `GET /api/campaigns/:id` — Detalhe
- `GET /api/metrics/summary?from=...&to=...` — Agregado

### Insights
- `GET /api/insights?from=...&to=...` — Todas as campanhas
- `GET /api/insights/campaigns/:id` — Por campanha

### Meta
- `GET /api/meta/connect` — URL de OAuth
- `GET /api/meta/accounts` — Contas conectadas

---

## 🐛 Troubleshooting

### "Port 3000 already in use"
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :3000
kill -9 <PID>
```

### "JWT_SECRET não configurado"
```bash
cd metaiq-backend
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# Copiar output para .env
```

### "Cannot find module '@nestjs/...'"
```bash
cd metaiq-backend
npm install
# ou
npm ci  # lockfile
```

### "ng not found frontend"
```bash
# Instalar Angular CLI globalmente
npm install -g @angular/cli

# Ou executar pelo local
npx ng serve
```

---

## 🔒 Segurança

- ✅ Senhas com bcrypt (12 rounds)
- ✅ JWT com expire 15min + refresh 7d
- ✅ Tokens Meta criptografados AES-256 em repouso
- ✅ Validação de entrada com class-validator
- ✅ Rate limiting (recomendado em produção)
- ✅ CORS configurado
- ✅ Helmet para headers HTTP

### Para Produção
- [ ] Usar HTTPS
- [ ] Mover .env para variáveis de ambiente
- [ ] Usar PostgreSQL em vez de SQLite
- [ ] Configurar rate limiting (express-rate-limit)
- [ ] Adicionar CSRF protection
- [ ] Habilitar helmet.csp()
- [ ] Seeds com dados sensíveis → .gitignore

---

## 📈 Performance

- Chart.js com lazy loading
- Signals Angular (sem subscriptions manuais)
- HTTP timeout + retry automático
- Computed values otimizados
- takeUntilDestroyed para cleanup
- Cron com período configurável

---

## 📚 Documentação

- [NestJS](https://docs.nestjs.com)
- [Angular 19](https://angular.io)
- [TypeORM](https://typeorm.io)
- [Chart.js](https://www.chartjs.org)
- [Meta Graph API](https://developers.facebook.com/docs/graph-api)

---

## 📄 Licença

UNLICENSED - Projeto privado

---

## 🤝 Suporte

Para problemas:
1. Verifique `.env` está bem configurado
2. Execute `node health-check.js`
3. Verifique logs do backend: `npm run start:dev`
4. Inspecione browser devtools (F12) no frontend

---

**Última atualização**: Abril 2026
**Versão**: 1.0.0

🎉 **Aproveite!**
