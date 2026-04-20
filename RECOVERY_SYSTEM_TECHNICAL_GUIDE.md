# 🔄 Sistema de Recuperação de Campanhas Meta - Guia Técnico

## 📋 Visão Geral

O sistema de recuperação permite que campanhas parcialmente criadas na Meta sejam:
- **Retomadas** a partir do ponto de falha
- **Limpas** para remover recursos órfãos
- **Monitoradas** para rastrear status

## 🏗️ Arquitetura

```
MetaCampaignRecoveryService
  ├── retryPartialCampaignCreation()
  │   └── resumeFromPartialFailure()
  │       └── orchestrator.resumeCreation()
  │
  ├── cleanupPartialResources()
  │   └── graphApi.delete()
  │
  └── getExecutionStatus()
```

## 🔧 Componentes Principais

### 1. MetaCampaignOrchestrator - resumeCreation()

**Novo método** que retoma a criação de uma campanha a partir de um ponto específico.

```typescript
async resumeCreation(input: {
  adAccountExternalId: string;
  accessToken: string;
  dto: CreateMetaCampaignDto;
  pageId: string;
  destinationUrl: string;
  objective: string;
  startingIds: Partial<MetaCampaignResourceIds>;  // IDs já criados
  onStepCreated: (step, ids) => Promise<void>;
}): Promise<Required<MetaCampaignResourceIds>>
```

**Lógica:**
```
Se campaign não existe:
  → Cria do zero (chama createResources())
Se campaign existe mas adset não:
  → Cria apenas adset
Se campaign + adset existem mas creative não:
  → Cria apenas creative
Se tudo existe menos ad:
  → Cria apenas ad
Retorna: Todos os IDs criados
```

### 2. MetaGraphApiClient - delete()

**Novo método** para deletar recursos na Meta API.

```typescript
async delete<T>(
  path: string,
  accessToken: string,
  timeout?: number
): Promise<T>
```

**Exemplo:**
```typescript
// Deletar um ad
await graphApi.delete('act_123/ads/456', accessToken);

// Deletar um adset
await graphApi.delete('act_123/adsets/789', accessToken);
```

### 3. MetaCampaignRecoveryService

**Orquestrador** da recuperação com 3 operações principais:

#### a) retryPartialCampaignCreation()

Retoma uma execução PARTIAL:

```typescript
async retryPartialCampaignCreation(
  executionId: string,
  accessToken: string,
  adAccountExternalId: string,
  dto: CreateMetaCampaignDto,
  pageId: string,
  destinationUrl: string,
  objective: string
)
```

**Fluxo:**
```
1. Carrega execução do banco
2. Verifica status:
   - ACTIVE → Retorna sucesso (já criado)
   - CREATING → Lança erro (em progresso)
   - FAILED → Lança erro (não recuperável)
   - PARTIAL → Tenta retomar
3. Marca como CREATING
4. Chama orchestrator.resumeCreation() com IDs parciais
5. Salva IDs completos
6. Marca como ACTIVE
```

#### b) cleanupPartialResources()

Remove recursos criados parcialmente:

```typescript
async cleanupPartialResources(
  executionId: string,
  accessToken: string,
  adAccountExternalId: string
)
```

**Fluxo de deleção (ordem reversa):**
```
1. Delete Ad (se existe)
2. Delete Creative (se existe)
3. Delete AdSet (se existe)
4. Delete Campaign (se existe)
```

**Por que ordem reversa?**
- Ad depende de AdSet
- AdSet depende de Campaign
- Campaign é independente
- Deletar em ordem reversa evita dependências

#### c) getExecutionStatus()

Retorna status detalhado de uma execução:

```typescript
async getExecutionStatus(executionId: string)
```

**Resposta:**
```json
{
  "id": "exec-123",
  "status": "PARTIAL",
  "idempotencyKey": "key-123",
  "step": "adset",
  "message": "Budget insuficiente",
  "partialIds": {
    "campaign": "120245670684470319",
    "adset": null,
    "creative": null,
    "ad": null
  },
  "store": {"id": "...", "name": "..."},
  "adAccount": {"id": "...", "metaId": "..."},
  "createdAt": "2026-04-20T...",
  "updatedAt": "2026-04-20T..."
}
```

## 🔌 Endpoints da API

### GET `/integrations/meta/stores/:storeId/campaigns/recovery/:executionId`

**Permissões:** PLATFORM_ADMIN, OPERATIONAL

**Resposta:**
```json
{
  "id": "execution-id",
  "status": "PARTIAL",
  "idempotencyKey": "chave-unica",
  "step": "adset",
  "message": "erro ao criar adset",
  "partialIds": {
    "campaign": "120245670684470319",
    "adset": null,
    "creative": null,
    "ad": null
  }
}
```

### POST `/integrations/meta/stores/:storeId/campaigns/recovery/:executionId/retry`

**Permissões:** PLATFORM_ADMIN, OPERATIONAL

**Body:**
```json
{
  "accessToken": "token-meta-oauth",
  "adAccountExternalId": "act_123456789",
  "pageId": "page-123",
  "destinationUrl": "https://example.com",
  "objective": "CONVERSIONS",
  "name": "Nome da Campanha",
  "dailyBudget": 50,
  "country": "BR",
  "initialStatus": "PAUSED",
  "message": "Texto do anúncio"
}
```

**Resposta (sucesso):**
```json
{
  "success": true,
  "message": "Campanha retomada e concluída com sucesso",
  "ids": {
    "campaignId": "120245670684470319",
    "adSetId": "23842705685680319",
    "creativeId": "120245670684470320",
    "adId": "120245670684470321"
  }
}
```

**Resposta (erro):**
```json
{
  "message": "Falha ao retomar em creative",
  "executionId": "exec-123",
  "step": "creative",
  "partialIds": {
    "campaignId": "120245670684470319",
    "adSetId": "23842705685680319",
    "creativeId": null,
    "adId": null
  },
  "error": "Object story spec structure invalid"
}
```

### POST `/integrations/meta/stores/:storeId/campaigns/recovery/:executionId/cleanup`

**Permissões:** PLATFORM_ADMIN, OPERATIONAL

**Body:**
```json
{
  "accessToken": "token-meta-oauth",
  "adAccountExternalId": "act_123456789"
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Limpeza concluída",
  "cleaned": {
    "ad": true,
    "creative": true,
    "adset": true,
    "campaign": true
  }
}
```

## 📊 Fluxos de Uso

### Fluxo 1: Retry (Recomendado)

```
User requests campaign creation
    ↓
Campaign created ✅, AdSet fails ❌
    ↓
System saves: status=PARTIAL, errorStep=adset, campaignId=123
    ↓
User sees error, retries
    ↓
GET /recovery/{executionId}
    ↓
See: PARTIAL, campaignId exists, adSetId null
    ↓
POST /recovery/{executionId}/retry
    ↓
Backend: resumeCreation({startingIds: {campaignId: 123}})
    ↓
Resumes from AdSet creation
    ↓
Creates AdSet ✅, Creative ✅, Ad ✅
    ↓
Success! Campaign fully created
```

### Fluxo 2: Cleanup + Novo

```
User requests campaign creation
    ↓
Campaign created ✅, AdSet fails ❌
    ↓
User quer usar outra idempotencyKey
    ↓
POST /recovery/{executionId}/cleanup
    ↓
Backend: deletes campaign, marks as FAILED
    ↓
Success! Resources removed from Meta
    ↓
POST /campaigns {idempotencyKey: "nova-chave"}
    ↓
Campaign created do zero
```

## 🧪 Testes

### Unit Tests

```bash
npm test -- meta-campaign-recovery.spec.ts
```

**Cenários cobertos:**
- ✅ Retry execução ACTIVE (retorna sucesso)
- ✅ Retry execução CREATING (lança CONFLICT)
- ✅ Retry execução FAILED (lança BAD_REQUEST)
- ✅ Retry execução PARTIAL (completa com sucesso)
- ✅ Cleanup recursos parciais
- ✅ Cleanup em ordem reversa
- ✅ Get status execução

### E2E Tests

```bash
npm run test:e2e -- meta-campaign-recovery.e2e-spec.ts
```

**Cenários cobertos:**
- ✅ Criação normal → Retry → Sucesso
- ✅ Criação normal → Cleanup → Nova criação
- ✅ Validação de autorização
- ✅ Tratamento de execuções inexistentes

## 🔐 Segurança

- ✅ **Autenticação JWT obrigatória**
- ✅ **Autorização por roles** (PLATFORM_ADMIN, OPERATIONAL)
- ✅ **Redação de tokens** nos logs
- ✅ **Validação de DTOs** com class-validator
- ✅ **Tratamento de erros seguro** (não expõe detalhes internos)

## 📈 Monitoramento

**Métricas a rastrear:**
- Número de execuções PARTIAL por mês
- Taxa de sucesso em retries
- Tempo médio para recuperação
- Erros mais comuns por step

**Logs estruturados:**
```json
{
  "event": "META_RECOVERY_RETRY_START",
  "executionId": "exec-123",
  "status": "PARTIAL",
  "errorStep": "adset"
}
```

## 🚀 Deployment

1. Deploy backend atualizado
2. Execute migrations (se necessário)
3. Registre novos endpoints no Swagger
4. Notifique usuarios sobre nova funcionalidade
5. Monitore erros por 48h

## 📚 Referências

- [Meta Graph API Docs](https://developers.facebook.com/docs/graph-api)
- [Campaign Creation Flow](../meta.service.ts#L460)
- [Idempotency Implementation](../meta-campaign-creation.entity.ts#L25)

## ❓ FAQs

**P: Posso fazer retry de uma execução FAILED?**
R: Não. FAILED significa que houve um erro não recuperável. Use cleanup + nova criação.

**P: Quanto tempo leva para um retry?**
R: Depende da Meta API. Normalmente 2-10 segundos por step.

**P: E se o cleanup falhar?**
R: Os erros são logados mas não bloqueiam. Tente novamente ou remova manualmente via Meta Business Manager.

**P: Posso usar o mesmo idempotencyKey após cleanup?**
R: Não recomendado. Gere um novo com timestamp para garantir unicidade.

---

**Versão:** 1.0  
**Última atualização:** Abril 2026
