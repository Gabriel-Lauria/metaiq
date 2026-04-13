# 📚 MetaIQ API Documentation

**Version:** 2.0  
**Status:** Production-Ready  
**Base URL:** `http://localhost:3000/api`

---

## 🔐 Authentication

All endpoints (except `/auth/*`) require a valid JWT token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

### POST `/auth/login`
Login com email e senha.

**Rate Limit:** 5 requisições por minuto

**Request:**
```json
{
  "email": "user@example.com",
  "password": "senha123"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Nome do Usuário"
  }
}
```

**Errors:**
- `401 Unauthorized` — Credenciais inválidas

---

### POST `/auth/refresh`
Renova o access token usando o refresh token.

**Rate Limit:** 10 requisições por minuto

**Request:**
```json
{
  "refreshToken": "eyJhbGc..."
}
```

**Response (200):** Mesmo formato do login

**Errors:**
- `401 Unauthorized` — Refresh token inválido ou expirado

---

## 👤 Users

### GET `/users/me`
Retorna dados do usuário autenticado.

**Response (200):**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "Nome",
  "active": true,
  "createdAt": "2026-04-13T10:00:00Z",
  "updatedAt": "2026-04-13T10:00:00Z"
}
```

---

### PATCH `/users/me`
Atualiza dados do usuário autenticado.

**Request:**
```json
{
  "name": "Novo Nome",
  "email": "newemail@example.com",
  "password": "novaSenha123"
}
```

**Response (200):** Usuário atualizado

---

### DELETE `/users/me`
Deleta (desativa) a conta do usuário.

**Response (200):**
```json
{
  "message": "Conta deletada"
}
```

---

## 🔗 Ad Accounts (Contas do Meta Ads)

### GET `/ad-accounts`
Lista todas as contas do usuário.

**Response (200):**
```json
[
  {
    "id": "uuid",
    "metaId": "act_123456789",
    "name": "Minha Conta Principal",
    "currency": "BRL",
    "active": true,
    "createdAt": "2026-04-13T10:00:00Z",
    "updatedAt": "2026-04-13T10:00:00Z"
  }
]
```

---

### POST `/ad-accounts`
Cria uma nova conta de anúncios.

**Request:**
```json
{
  "metaId": "act_123456789",
  "name": "Nova Conta",
  "currency": "BRL"
}
```

**Response (201):** Conta criada

---

### GET `/ad-accounts/:id`
Retorna uma conta específica.

---

### PATCH `/ad-accounts/:id`
Atualiza dados da conta.

**Request:**
```json
{
  "name": "Nome Atualizado",
  "active": true
}
```

---

### DELETE `/ad-accounts/:id`
Desativa uma conta.

**Response (200):**
```json
{
  "message": "Conta desativada"
}
```

---

## 📊 Campaigns (Campanhas)

### GET `/campaigns`
Lista campanhas com paginação.

**Query Parameters:**
- `page` (default: 1) — Número da página
- `limit` (default: 10) — Itens por página

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "metaId": "123456789",
      "name": "Campanha Conversão",
      "status": "ACTIVE",
      "objective": "CONVERSIONS",
      "dailyBudget": 100.00,
      "score": 85,
      "startTime": "2026-04-01T00:00:00Z",
      "endTime": null,
      "userId": "uuid",
      "adAccountId": "uuid",
      "createdAt": "2026-04-13T10:00:00Z",
      "updatedAt": "2026-04-13T10:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

### POST `/campaigns`
Cria uma nova campanha.

**Request:**
```json
{
  "metaId": "123456789",
  "name": "Nova Campanha",
  "adAccountId": "uuid",
  "dailyBudget": 150.00,
  "startTime": "2026-04-15T00:00:00Z",
  "status": "ACTIVE",
  "objective": "CONVERSIONS"
}
```

**Response (201):** Campanha criada

---

### GET `/campaigns/:id`
Retorna uma campanha específica.

---

### PATCH `/campaigns/:id`
Atualiza dados da campanha.

**Request:**
```json
{
  "name": "Nome Atualizado",
  "status": "PAUSED",
  "dailyBudget": 200.00
}
```

---

### DELETE `/campaigns/:id`
Arquiva uma campanha.

**Response (200):**
```json
{
  "message": "Campanha arquivada"
}
```

---

### GET `/campaigns/user/:userId`
Lista campanhas de um usuário.

---

### GET `/campaigns/ad-account/:adAccountId`
Lista campanhas de uma conta.

---

## 📈 Metrics (Métricas)

### GET `/metrics/summary`
Retorna sumário de métricas agregadas.

**Query Parameters:**
- `from` (required) — Data inicial (YYYY-MM-DD)
- `to` (required) — Data final (YYYY-MM-DD)

**Response (200):**
```json
{
  "period": {
    "from": "2026-04-01",
    "to": "2026-04-13"
  },
  "totals": {
    "totalSpend": 5280.50,
    "totalImpressions": 125000,
    "totalClicks": 3850,
    "totalConversions": 280,
    "totalRevenue": 18900.00
  },
  "averages": {
    "avgCTR": 3.08,
    "avgCPC": 1.37,
    "avgCPA": 18.86,
    "avgROAS": 3.58
  },
  "byDay": [
    {
      "date": "2026-04-01",
      "spend": 380.00,
      "impressions": 9000,
      "clicks": 250,
      "conversions": 18,
      "revenue": 1340.00,
      "roas": 3.53
    }
    // ... mais dias
  ]
}
```

---

## 🧠 Insights (Análise Automática)

### GET `/insights`
Lista insights gerados.

**Query Parameters:**
- `campaignId` — Filtrar por campanha
- `type` — Filtrar por tipo (alert, warning, opportunity, info)
- `severity` — Filtrar por severidade (danger, warning, success, info)
- `resolved` — Filtrar por status (true/false)

**Response (200):**
```json
[
  {
    "id": "uuid",
    "campaignId": "uuid",
    "type": "alert",
    "severity": "danger",
    "message": "🚨 ROAS de 0.85x: você está perdendo dinheiro nesta campanha",
    "recommendation": "Pause a campanha imediatamente e revise: criativo, audiência, landing page e pixel",
    "resolved": false,
    "detectedAt": "2026-04-13T10:00:00Z",
    "updatedAt": "2026-04-13T10:00:00Z"
  }
]
```

---

### PATCH `/insights/:id/resolve`
Marca um insight como resolvido.

**Response (200):** Insight atualizado com `resolved: true`

---

## 🔍 Insights Engine — 12 Regras Automáticas

O engine de insights analisa campanhas a cada hora e gera recomendações:

| # | Nome | Trigger | Ação |
|---|------|---------|------|
| 1 | ROAS Danger | ROAS < 1.0 | 🚨 Alerta — Prejuízo |
| 2 | ROAS Warning | 1.0 ≤ ROAS < 2.0 | ⚠️ Aviso — Margem Baixa |
| 3 | ROAS Opportunity | ROAS ≥ 4.0 | ✨ Oportunidade — Escalar |
| 4 | CTR Danger | CTR < 0.5% | 🚨 Alerta — Criativo Ruim |
| 5 | CTR Warning | 0.5% ≤ CTR < 1.0% | ⚠️ Aviso — Abaixo Média |
| 6 | CTR Opportunity | CTR ≥ 3.0% | ✨ Oportunidade — Criativo Excelente |
| 7 | CPA High | CPA > 50% budget diário | ⚠️ Aviso — CPA Alto |
| 8 | CPA Low | CPA < 20% budget diário | ✨ Oportunidade — CPA Eficiente |
| 9 | Overspend | Gasto > 110% budget | ⚠️ Aviso — Acima do Budget |
| 10 | No Conversions | Gasto > R$50 sem conversão | 🚨 Alerta — Sem Resultados |
| 11 | Campaign Ending | Dias até encerramento < 3 | ℹ️ Info — Campanha Encerrando |
| 12 | No Recent Data | Sem dados há > 3 dias | ⚠️ Aviso — Campanha Inativa |

---

## 📋 Cálculos de Métricas

Todas as métricas são calculadas com fórmulas padronizadas da indústria:

```
CTR  = (Clicks / Impressions) × 100         — %
CPC  = Spend / Clicks                        — R$
CPA  = Spend / Conversions                   — R$
ROAS = Revenue / Spend                       — Multiplicador
Score = (ROAS / 3) × 100                     — 0-100 para ranking
```

---

## ⚡ Rate Limiting

| Endpoint | Limite |
|----------|--------|
| `/auth/login` | 5 req/min por IP |
| `/auth/refresh` | 10 req/min por IP |
| Outros | 20 req/min por IP |

---

## 🔧 Cron Jobs

| Job | Schedule | Ação |
|-----|----------|------|
| `generateInsights` | A cada hora | Gera insights para campanhas ativas |
| `cleanOldResolvedInsights` | A cada 30min | Limpa insights resolvidos > 30 dias |
| `syncMetaData` | A cada 6h | Sincroniza com Meta API (futuro) |

---

## 🛡️ Segurança

- ✅ JWT com access token (15min) + refresh token (7 dias)
- ✅ Bcrypt 12-rounds para senhas
- ✅ AES-256 para criptografia de dados sensíveis
- ✅ Helmet.js para headers HTTP seguro
- ✅ CORS configurado por domínio
- ✅ Rate limiting por endpoint
- ✅ Validação de Input com whitelist
- ✅ SQL injection protection (TypeORM)

---

## 📚 Exemplo de Fluxo Completo

1. **Login:**
   ```bash
   POST /auth/login
   { "email": "demo@metaiq.dev", "password": "Demo@1234" }
   ```

2. **Listar Campanhas:**
   ```bash
   GET /campaigns?page=1&limit=10
   Authorization: Bearer <access_token>
   ```

3. **Criar Campanha:**
   ```bash
   POST /campaigns
   Authorization: Bearer <access_token>
   {
     "metaId": "123",
     "name": "Nova Campanha",
     "adAccountId": "uuid",
     "dailyBudget": 100,
     "startTime": "2026-04-15T00:00:00Z"
   }
   ```

4. **Ver Insights:**
   ```bash
   GET /insights?resolved=false
   Authorization: Bearer <access_token>
   ```

5. **Renovar Token (quando expirar):**
   ```bash
   POST /auth/refresh
   { "refreshToken": "<refresh_token>" }
   ```

---

## 📞 Suporte

Para issues ou dúvidas, consulte a documentação em `/docs/ARQUITETURA.md`
