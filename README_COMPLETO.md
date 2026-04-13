# 🎯 MetaIQ - Plataforma de Análise de Campanhas

<div align="center">

[![React](https://img.shields.io/badge/React-18.3-blue?style=flat-square&logo=react)](https://react.dev)
[![NestJS](https://img.shields.io/badge/NestJS-9+-red?style=flat-square&logo=nestjs)](https://nestjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-blue?style=flat-square&logo=postgresql)](https://www.postgresql.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

**Sistema completo ponta-a-ponta para análise de campanhas de marketing**

[Features](#-features) • [Arquitetura](#-arquitetura) • [Quick Start](#-quick-start) • [API](#-api) • [Deployment](#-deployment)

</div>

---

## ✨ Features

### 🔐 Autenticação & Segurança
- ✅ Autenticação JWT com tokens seguros
- ✅ Hash de senhas com bcrypt
- ✅ Proteção de rotas no frontend
- ✅ CORS configurado
- ✅ Rate limiting ready

### 📊 Dashboard
- ✅ Visualização de campanhas em tempo real
- ✅ Métricas agregadas (orçamento, gasto, ROI)
- ✅ Status de campanhas (Ativa, Pausa, Arquivada)
- ✅ Barra de progresso de gastos
- ✅ Responsivo para mobile/tablet

### 🛠️ Stack Moderno
- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: NestJS + TypeORM
- **Database**: PostgreSQL
- **Autenticação**: JWT + Passport.js
- **Validação**: class-validator, class-transformer

### 📱 UI/UX
- ✅ Design moderno com paleta roxo-azul
- ✅ Animações suaves
- ✅ Dark mode ready
- ✅ Acessibilidade (WCAG)
- ✅ Mobile-first responsive

---

## 🏗️ Arquitetura

### Estrutura de Pastas

```
metaiq/
├── metaiq-backend/
│   ├── src/
│   │   ├── auth/              # Módulo de autenticação
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── jwt.strategy.ts
│   │   │   └── jwt.guard.ts
│   │   ├── campaigns/         # Módulo de campanhas
│   │   │   ├── campaigns.controller.ts
│   │   │   ├── campaigns.service.ts
│   │   │   └── campaign.entity.ts
│   │   ├── users/             # Módulo de usuários
│   │   │   ├── users.controller.ts
│   │   │   ├── users.service.ts
│   │   │   └── user.entity.ts
│   │   ├── app.module.ts      # Módulo raiz
│   │   └── main.ts            # Entry point
│   ├── package.json
│   ├── .env                   # Variáveis de ambiente
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.tsx      # Página de login
│   │   │   ├── Login.css
│   │   │   ├── Dashboard.tsx  # Dashboard principal
│   │   │   └── Dashboard.css
│   │   ├── services/
│   │   │   └── api.ts         # Cliente API com JWT
│   │   ├── hooks/
│   │   │   └── useAuth.ts     # Hook de autenticação
│   │   ├── App.tsx            # Componente raiz com rotas
│   │   ├── main.tsx           # Entry point
│   │   └── index.css          # Estilos globais
│   ├── package.json
│   ├── vite.config.ts         # Configuração Vite
│   └── tsconfig.json
│
├── metaiq-frontend/           # Antigo (HTML estático) - Deprecated
├── STATUS_SPRINT_1.md         # Status da primeira sprint
├── GUIA_TESTE_SISTEMA.md      # Guia de testes
├── start-dev.sh               # Script de start (Linux/Mac)
├── start-dev.ps1              # Script de start (Windows)
└── README.md                  # Este arquivo
```

### Fluxo de Dados

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│     Frontend (React + Vite)         │
│  ├─ Login Page                      │
│  ├─ Dashboard with Charts           │
│  ├─ Protected Routes                │
│  └─ API Service with JWT            │
└──────┬──────────────────────────────┘
       │ (HTTP + JWT)
       ▼
┌─────────────────────────────────────┐
│   Backend (NestJS + TypeORM)        │
│  ├─ Auth Module (JWT, Passport)     │
│  ├─ Campaigns Module (CRUD)         │
│  ├─ Users Module                    │
│  └─ Metrics Module                  │
└──────┬──────────────────────────────┘
       │ (ORM)
       ▼
┌─────────────────────────────────────┐
│   Database (PostgreSQL)             │
│  ├─ users table                     │
│  ├─ campaigns table                 │
│  ├─ metrics_daily table             │
│  └─ ad_accounts table               │
└─────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Pré-requisitos
- Node.js 18+ (nvm recomendado)
- PostgreSQL 14+
- Git
- npm ou yarn

### 1️⃣ Clone o repositório

```bash
git clone https://github.com/seu-usuario/metaiq.git
cd metaiq
```

### 2️⃣ Configure o banco de dados

```bash
# Crie o banco de dados PostgreSQL
createdb metaiq

# Ou use pgAdmin:
# 1. Abra pgAdmin
# 2. Create Database > metaiq
# 3. Grant privileges ao usuário
```

### 3️⃣ Configure variáveis de ambiente

**Backend** - `metaiq-backend/.env`:
```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=sua_senha
DB_NAME=metaiq

# JWT
JWT_SECRET=sua_chave_super_secreta_aqui
JWT_EXPIRATION=24h

# App
APP_PORT=3000
NODE_ENV=development
```

### 4️⃣ Instale dependências

```bash
# Backend
cd metaiq-backend
npm install

# Frontend
cd ../frontend
npm install
```

### 5️⃣ Execute as migrations (se houver)

```bash
cd metaiq-backend
npm run typeorm migration:run
```

### 6️⃣ Inicie os serviços

**Opção A: Scripts automáticos**

Linux/Mac:
```bash
cd .. && chmod +x start-dev.sh && ./start-dev.sh
```

Windows (PowerShell):
```powershell
cd .. ; .\start-dev.ps1
```

**Opção B: Manual (dois terminais)**

Terminal 1 - Backend:
```bash
cd metaiq-backend
npm run start:dev
```

Terminal 2 - Frontend:
```bash
cd frontend
npm run dev
```

### 7️⃣ Acesse a aplicação

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Docs API: http://localhost:3000/api

---

## 📡 API Endpoints

### Autenticação

```http
POST /auth/login
Content-Type: application/json

{
  "email": "usuario@exemplo.com",
  "password": "senha123"
}

Response 200:
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "usuario@exemplo.com",
    "name": "João Silva"
  }
}
```

### Campanhas

```http
GET /campaigns
Authorization: Bearer <access_token>

Response 200:
[
  {
    "id": 1,
    "name": "Campanha Verão 2024",
    "status": "active",
    "budget": 5000.00,
    "spent": 2350.75
  },
  ...
]
```

```http
POST /campaigns
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Nova Campanha",
  "budget": 10000.00,
  "description": "Campanha de Black Friday"
}

Response 201:
{
  "id": 2,
  "name": "Nova Campanha",
  "status": "active",
  "budget": 10000,
  "spent": 0
}
```

### Métricas

```http
GET /metrics
Authorization: Bearer <access_token>

Response 200:
{
  "totalBudget": 15000,
  "totalSpent": 2350.75,
  "totalCampaigns": 2,
  "activeCampaigns": 2,
  "roi": 1.23
}
```

Para mais detalhes, veja a documentação da API:
- Swagger: http://localhost:3000/api
- Collection Postman: `docs/postman_collection.json`

---

## 🧪 Testes

### Frontend

```bash
cd frontend

# Rodar testes
npm run test

# Cobertura
npm run test -- --coverage

# Watch mode
npm run test -- --watch
```

### Backend

```bash
cd metaiq-backend

# Testes unitários
npm run test

# Testes e2e
npm run test:e2e

# Cobertura
npm run test:cov
```

---

## 🐛 Debugging

### Frontend

Ative DevTools:
```
F12 ou Ctrl+Shift+I
```

Console:
```javascript
// Ver token armazenado
console.log(localStorage.getItem("token"));

// Limpar dados
localStorage.clear();
```

### Backend

Logs:
```bash
# Watch mode com logs detalhados
npm run start:debug

# Verificar porta
netstat -ano | findstr :3000
```

---

## 🚀 Build & Deployment

### Build para Produção

**Frontend:**
```bash
cd frontend
npm run build

# Output: dist/
```

**Backend:**
```bash
cd metaiq-backend
npm run build

# Output: dist/
```

### Docker

```bash
# Build
docker-compose build

# Run
docker-compose up

# Stop
docker-compose down
```

### Deploy Vercel (Frontend)

```bash
npm install -g vercel
vercel
```

### Deploy Render (Backend)

1. Push seu código para GitHub
2. Crie novo Web Service no Render
3. Conecte seu repositório
4. Configure variáveis de ambiente
5. Deploy automático

---

## 📚 Documentação Adicional

- [Frontend Setup](./frontend/README.md)
- [Backend Setup](./metaiq-backend/README.md)
- [Database Schema](./docs/database-schema.md)
- [API Reference](./docs/api-reference.md)
- [Contributing Guidelines](CONTRIBUTING.md)

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Faça fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/amazing-feature`)
3. Commit suas mudanças (`git commit -m 'Add amazing feature'`)
4. Push para a branch (`git push origin feature/amazing-feature`)
5. Abra um Pull Request

Veja [CONTRIBUTING.md](CONTRIBUTING.md) para detalhes.

---

## 📝 Roadmap

### Sprint 2 (Próximo)
- [ ] Gráficos de performance
- [ ] Filtros avançados
- [ ] Exportação de relatórios
- [ ] Integração Meta Ads API
- [ ] Sistema de notificações

### Sprint 3
- [ ] Machine Learning para insights
- [ ] Dashboard customizável
- [ ] API webhooks
- [ ] Mobile app (React Native)
- [ ] Dark mode completo

### Sprint 4+
- [ ] Multi-tenant SaaS
- [ ] Pagamentos (Stripe)
- [ ] Analytics avançado
- [ ] Integrações Google Ads
- [ ] Automações com Zapier

---

## 🔒 Segurança

### Boas Práticas Implementadas

- ✅ JWT com expiração
- ✅ HTTPS em produção
- ✅ Rate limiting
- ✅ SQL Injection prevention (TypeORM)
- ✅ XSS protection
- ✅ CSRF tokens
- ✅ Password hashing (bcrypt)

### Reporte de Vulnerabilidades

Por favor, reporte vulnerabilidades para: security@metaiq.com

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja [LICENSE](LICENSE) para detalhes.

---

## 👥 Time

- **Gabriel Lauria** - Full Stack Developer

---

## 💬 Suporte

### Perguntas?

- 📧 Email: gabriel@metaiq.com
- 💬 Discord: [MetaIQ Community](https://discord.gg/metaiq)
- 📖 Wiki: [GitHub Wiki](https://github.com/seu-usuario/metaiq/wiki)

### Relatório de Bugs

[Abrir Issue](https://github.com/seu-usuario/metaiq/issues/new)

---

## ⭐ Agradecimentos

Agradecimentos especiais a:
- NestJS Team
- React Community
- PostgreSQL
- Vite
- E toda a comunidade open source

---

<div align="center">

Feito com ❤️ por Gabriel Lauria

[⬆ Voltar ao topo](#-metaiq---plataforma-de-análise-de-campanhas)

</div>
