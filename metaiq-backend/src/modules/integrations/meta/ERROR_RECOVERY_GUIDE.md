# 🔧 Resolução de Erro: Criação Parcial de Campanha na Meta

## 📋 Seu Erro Específico

```
message: "Já existe uma execução anterior não concluída para esta idempotencyKey. 
          Use outra chave após validar os recursos parciais na Meta."
step: "adset"
executionStatus: "PARTIAL"
campaignId: "120245670684470319"
```

**O que aconteceu:**
1. ✅ Campaign foi criado com sucesso (ID: `120245670684470319`)
2. ❌ AdSet falhou (erro ao criar ad set)
3. 🔒 Sistema bloqueou retry com mesma chave

---

## ✅ Soluções (em ordem de preferência)

### Solução 1: RETRY AUTOMÁTICO (Recomendado)

**Se a falha foi temporária (timeout, rate limit, etc)**, continue de onde parou:

```bash
# 1. Obter informações da execução
GET /api/integrations/meta/stores/{storeId}/campaigns/recovery/{executionId}

Resposta:
{
  "id": "exec-123",
  "status": "PARTIAL",
  "step": "adset",
  "partialIds": {
    "campaign": "120245670684470319",
    "adset": null,
    "creative": null,
    "ad": null
  }
}

# 2. Retomar criação
POST /api/integrations/meta/stores/{storeId}/campaigns/recovery/{executionId}/retry
Content-Type: application/json

{
  "accessToken": "sua-chave-meta",
  "adAccountExternalId": "act_123456789",
  "pageId": "seu-page-id",
  "destinationUrl": "https://seu-site.com",
  "objective": "CONVERSIONS",
  "name": "Nome da Campanha",
  "dailyBudget": 50,
  "country": "BR",
  "initialStatus": "PAUSED",
  "message": "Seu texto de anúncio"
}

Resposta (sucesso):
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

---

### Solução 2: CLEANUP (Remover recursos parciais)

**Se quiser limpar e começar do zero:**

```bash
# 1. Remover recursos parciais
POST /api/integrations/meta/stores/{storeId}/campaigns/recovery/{executionId}/cleanup
Content-Type: application/json

{
  "accessToken": "sua-chave-meta",
  "adAccountExternalId": "act_123456789"
}

Resposta:
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

# 2. Agora crie nova campanha com idempotencyKey diferente
POST /api/integrations/meta/stores/{storeId}/campaigns
Content-Type: application/json

{
  "idempotencyKey": "nova-chave-diferente", // ← IMPORTANTE: Mudar isto!
  "name": "Minha Campanha",
  "adAccountId": "act_123456789",
  ...
}
```

---

### Solução 3: USAR OUTRA IDEMPOTENCY KEY (Simples)

**Se não quiser os recursos parciais:**

```bash
# Simplesmente use um idempotencyKey diferente
POST /api/integrations/meta/stores/{storeId}/campaigns
{
  "idempotencyKey": "chave-totalmente-diferente", // ← Mude isto
  "name": "Minha Campanha",
  ...
}
```

**Notas:**
- Os recursos parciais (campaign criado) ficarão órfãos na Meta
- Você pode removê-los manualmente no Meta Business Manager
- Não afeta seu banco de dados local

---

## 🎯 O Que Fazer Agora

### Passo 1: Verificar Status

```bash
curl -X GET \
  "https://api.seu-dominio.com/api/integrations/meta/stores/{storeId}/campaigns/recovery/{executionId}" \
  -H "Authorization: Bearer {seu-token}"
```

**Procure por:**
- `executionStatus`: Qual é o status (PARTIAL, FAILED, CREATING)?
- `step`: Em qual passo falhou?
- `partialIds`: Quais recursos foram criados?

### Passo 2: Escolha Ação

#### Se status = PARTIAL:
```
1. PREFERE CONTINUAR? → Use Solução 1 (RETRY)
2. QUER LIMPAR? → Use Solução 2 (CLEANUP)
3. QUER IGNORAR? → Use Solução 3 (NOVA CHAVE)
```

#### Se status = CREATING:
```
Aguarde 5-10 minutos. A criação pode estar em progresso.
Depois verifique de novo.
```

#### Se status = FAILED:
```
Não pode ser retomado. Deve usar Solução 3 (nova chave).
```

#### Se status = ACTIVE:
```
A campanha foi criada com sucesso! Parabéns! 🎉
```

---

## 🔍 Entendendo a Idempotência

### O que é Idempotency Key?

Uma **chave única** que previne duplicação quando há retries:

```
Primeira tentativa com Key="my-campaign-123":
  POST /campaigns {idempotencyKey: "my-campaign-123"}
  → Cria campaign (ID: 120245...)
  → Falha ao criar adset
  → Status: PARTIAL

Segunda tentativa com MESMA Key:
  POST /campaigns {idempotencyKey: "my-campaign-123"}
  → Erro: "Já existe uma execução anterior"
  
Segunda tentativa com OUTRA Key:
  POST /campaigns {idempotencyKey: "my-campaign-456"}
  → ✅ Cria nova campaign (ID: 120246...)
```

### Por Que Usar?

Evita criar múltiplas campanhas em caso de:
- Network timeout
- Duplo-clique do usuário
- Client retry automático

---

## 📊 Fluxograma de Decisão

```
┌─────────────────────────────────────┐
│ Executar GET status                 │
└────────────┬────────────────────────┘
             │
      ┌──────┴──────┬──────────────┬──────────────┐
      │             │              │              │
      ▼             ▼              ▼              ▼
   PARTIAL      CREATING        FAILED         ACTIVE
      │             │              │              │
      │      Aguarde 5-10      Limpar         ✅ Pronto
      │      minutos            (Sol 2)
      │             │              │
      └─────┬───────┘              │
            │                      │
    ┌───────▼────────┐             │
    │ Tentar Retry?  │             │
    ├────────┬───────┤             │
    │        │                     │
    ▼        ▼                     ▼
    Sim    Não                  Usar
   (Sol 1)(Sol 3)         nova Key
                           (Sol 3)
```

---

## 🚨 Cenários Comuns

### Cenário 1: "Minha conexão caiu durante a criação"

**Solução:** RETRY (Sol 1)
```bash
POST /campaigns/recovery/{executionId}/retry
```
✅ Tenta continuar de onde parou

---

### Cenário 2: "Recebi erro 'budget inválido'"

**Solução:** CLEANUP + NOVA TENTATIVA (Sol 2 + Sol 3)
```bash
# 1. Limpar
POST /campaigns/recovery/{executionId}/cleanup

# 2. Criar nova com budget correto
POST /campaigns {
  "idempotencyKey": "nova-chave",
  "dailyBudget": 100  # ← Corrigido
}
```

---

### Cenário 3: "Não sei o que deu errado"

**Solução:** Ver logs detalhados

```bash
# GET status mostra:
{
  "step": "adset",
  "message": "Budget must be at least 100 cents"
}

# Agora você sabe: Budget insuficiente
# Limpe e tente novamente com budget maior
```

---

## 🛠️ Implementação no Frontend

### React Example

```typescript
// Passo 1: Verificar se há execução anterior
async function checkPreviousExecution(executionId: string) {
  const response = await fetch(
    `/api/integrations/meta/stores/${storeId}/campaigns/recovery/${executionId}`
  );
  const status = await response.json();
  
  if (status.status === 'PARTIAL') {
    // Mostrar UI perguntando se deseja continuar
    showRecoveryDialog(status);
  }
}

// Passo 2: Retry (se usuário escolher continuar)
async function retryPartialCampaign(executionId: string, campaignData: any) {
  try {
    const response = await fetch(
      `/api/integrations/meta/stores/${storeId}/campaigns/recovery/${executionId}/retry`,
      {
        method: 'POST',
        body: JSON.stringify({
          accessToken: campaignData.accessToken,
          adAccountExternalId: campaignData.adAccountId,
          pageId: campaignData.pageId,
          destinationUrl: campaignData.destinationUrl,
          objective: campaignData.objective,
          name: campaignData.name,
          dailyBudget: campaignData.dailyBudget,
          country: campaignData.country,
          initialStatus: campaignData.initialStatus,
          message: campaignData.message,
        }),
      }
    );
    
    const result = await response.json();
    
    if (result.success) {
      showSuccess('Campanha retomada com sucesso!');
      return result.ids;
    }
  } catch (error) {
    showError(`Erro ao retomar: ${error.message}`);
  }
}

// Passo 3: Cleanup (se usuário escolher desistir)
async function cleanupPartialResources(executionId: string, accessToken: string, adAccountId: string) {
  try {
    const response = await fetch(
      `/api/integrations/meta/stores/${storeId}/campaigns/recovery/${executionId}/cleanup`,
      {
        method: 'POST',
        body: JSON.stringify({
          accessToken,
          adAccountExternalId: adAccountId,
        }),
      }
    );
    
    const result = await response.json();
    
    if (result.success) {
      showSuccess('Recursos removidos. Você pode tentar novamente.');
      return true;
    }
  } catch (error) {
    showError(`Erro ao limpar: ${error.message}`);
  }
}
```

---

## 📞 Quando Contatar Suporte

- ❓ Se o retry falhar novamente
- ❓ Se não conseguir remover recursos
- ❓ Se houver erro na API Meta que não entende
- ❓ Se a execução travar em CREATING por >30 min

**Forneça:**
- `executionId`
- `idempotencyKey`
- `step` onde falhou
- Mensagem de erro completa

---

## ✅ Checklist de Resolução

- [ ] Obti status da execução
- [ ] Escolhi uma solução (Retry, Cleanup, ou Nova Chave)
- [ ] Executei a solução
- [ ] Testei a nova campanha
- [ ] Verifiquei que a campanha foi criada na Meta
- [ ] Acompanhei métricas por 24h

---

**Versão:** 1.0  
**Última atualização:** Abril 2026  
**Status:** Pronto para usar
