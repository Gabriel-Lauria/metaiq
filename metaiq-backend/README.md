# metaIQ — Plataforma de Inteligência para Meta Ads

Sistema completo: NestJS + SQLite + Angular 19.
Sem dependências externas — roda direto no seu PC.

---

## Início em 4 comandos

```bash
# 1. Backend
cd metaiq-backend
npm install
cp .env.example .env      # editar JWT_SECRET, CRYPTO_SECRET, META_APP_ID
npm run seed              # cria banco + dados de demo
npm run start:dev         # http://localhost:3000

# 2. Frontend (outro terminal)
cd metaiq-frontend
npm install
ng serve                  # http://localhost:4200
```

Login com dados de demo:
  Email:  demo@metaiq.dev
  Senha:  Demo@1234

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | NestJS 11 + TypeORM |
| Banco | SQLite via sql.js (arquivo .db local) |
| Auth | JWT access (15min) + refresh (7d) + bcrypt |
| Tokens Meta | AES-256 criptografado em repouso |
| Coleta | Cron job a cada 1h (@nestjs/schedule) |
| API Meta | Graph API v19 via OAuth 2.0 |
| Frontend | Angular 19 + Chart.js + SCSS |
| Testes | Jest — 14/14 passando |

---

## Estrutura

```
metaiq/
├── metaiq-backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/          JWT, login, registro, refresh
│   │   │   ├── users/         Perfil
│   │   │   ├── meta/          OAuth Meta + Graph API
│   │   │   ├── campaigns/     Campanhas sincronizadas
│   │   │   ├── metrics/       Métricas diárias + engine CTR/CPA/ROAS
│   │   │   └── insights/      12 regras de negócio + scores
│   │   ├── infrastructure/
│   │   │   └── cron/          Coleta automática a cada 1h
│   │   ├── common/            Guards, decorators, filtros, crypto
│   │   └── seed.ts            Dados de demonstração
│   └── .env.example
│
├── metaiq-frontend/
│   └── src/app/
│       ├── core/              Models, services, guards, interceptors
│       └── features/
│           ├── auth/          Login + Registro
│           ├── dashboard/     KPIs, gráficos, insights
│           ├── campaigns/     Tabela com score e drill-down
│           └── accounts/      Contas Meta conectadas
│
└── docker-compose.yml         Ambiente containerizado (opcional)
```

---

## Configurar Meta API (para dados reais)

1. Acesse developers.facebook.com → criar App → tipo Business
2. Adicionar produto: Marketing API
3. Em OAuth → Redirect URIs: `http://localhost:3000/meta/callback`
4. Copiar App ID e App Secret para o `.env`
5. Acesse `/accounts` no frontend → clicar "Conectar com Facebook"
6. O cron job coleta automaticamente a cada hora

Enquanto não conectar uma conta Meta, use os dados do seed.

---

## Variáveis do .env

```env
SQLITE_PATH=./data/metaiq.db

JWT_SECRET=gere_com_node_crypto_randomBytes_48
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=outro_segredo_diferente
JWT_REFRESH_EXPIRES_IN=7d

CRYPTO_SECRET=minimo_32_caracteres_aqui!!!!

META_APP_ID=seu_app_id
META_APP_SECRET=seu_app_secret
META_REDIRECT_URI=http://localhost:3000/meta/callback
META_API_VERSION=v19.0

PORT=3000
NODE_ENV=development
```

Gerar segredos:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Scripts do Backend

```bash
npm run start:dev    # desenvolvimento com hot-reload
npm run start:prod   # produção
npm run build        # compilar TypeScript
npm run seed         # popular banco com dados demo
npm test             # 14/14 testes
npm run test:cov     # com cobertura
```

---

## Engine de Score (0–100)

| Pilar | Peso | Referência |
|---|---|---|
| CTR  | 30% | 2% = máximo |
| CPA  | 40% | ≤ R$10 = máximo · > R$100 = zero |
| ROAS | 30% | 3x = máximo |

---

## Regras de Insights (12 regras)

| Código | Tipo | Condição |
|---|---|---|
| ROAS_EXCELLENT | success | ROAS ≥ 5x |
| ROAS_GOOD | success | ROAS ≥ 3x |
| ROAS_LOW | warning | 0 < ROAS < 3x |
| ROAS_NEGATIVE | danger | ROAS < 1x |
| CPA_EXCELLENT | success | CPA ≤ R$20 |
| CPA_HIGH | warning | CPA > R$50 |
| CPA_CRITICAL | danger | CPA > R$100 |
| NO_CONVERSIONS | warning | gasto > 0 e conversões = 0 |
| CTR_LOW | warning | CTR < 0,5% |
| CTR_HIGH | success | CTR ≥ 3% |
| SCORE_HIGH | success | score ≥ 80 |
| SCORE_LOW | danger | score < 30 |

---

## Endpoints da API

```
GET  /health

POST /auth/register        { name, email, password }
POST /auth/login           { email, password }
POST /auth/refresh         { refreshToken }

GET  /users/me             🔒
PATCH /users/me            🔒

GET  /meta/connect         🔒 → OAuth Facebook
GET  /meta/callback
GET  /meta/accounts        🔒

GET  /campaigns            🔒
GET  /campaigns/:id        🔒

GET  /metrics/summary               🔒 ?from=&to=
GET  /metrics/campaigns/:id         🔒
GET  /metrics/campaigns/:id/aggregate 🔒

GET  /insights             🔒 ?from=&to=
GET  /insights/campaigns/:id 🔒
```
