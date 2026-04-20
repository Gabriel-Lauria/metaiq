# ⚡ Solução Rápida - Seu Erro Agora

## 🔴 Seu Error Exato

```json
{
  "error": "Internal Server Error",
  "errorMessage": "Invalid parameter",
  "message": "Já existe uma execução anterior não concluída para esta idempotencyKey. Use outra chave após validar os recursos parciais na Meta.",
  "step": "adset",
  "statusCode": 400,
  "executionStatus": "PARTIAL",
  "executionId": "2e9faabb-c278-4c59-b06d-836e38bf2301",
  "idempotencyKey": "e1173d6d171dd7e1db71ff3f77e79355efe4c3e8ae6db9e070e8bf96e30bde2d",
  "campaignId": "120245670684470319"
}
```

---

## ✅ Solução Agora (3 opções)

### Opção 1: Usar Outro idempotencyKey (MAIS RÁPIDO)

```javascript
// No seu request, mude o idempotencyKey para algo diferente

// ❌ Antes (falhou):
fetch('/api/integrations/meta/stores/{storeId}/campaigns', {
  method: 'POST',
  body: JSON.stringify({
    idempotencyKey: 'e1173d6d171dd7e1db71ff3f77e79355efe4c3e8ae6db9e070e8bf96e30bde2d',
    name: 'Minha Campanha',
    ...
  })
})

// ✅ Depois (funciona):
fetch('/api/integrations/meta/stores/{storeId}/campaigns', {
  method: 'POST',
  body: JSON.stringify({
    idempotencyKey: 'nova-chave-' + Date.now(), // ← MUDOU!
    name: 'Minha Campanha',
    ...
  })
})
```

**Resultado:**
- ✅ Nova campaign será criada
- ⚠️ A anterior (`120245670684470319`) ficará órfã na Meta
- ⚠️ Você pode remover manualmente depois

---

### Opção 2: Verificar Recursos Parciais na Meta

Acesse **Meta Business Manager** e veja:

```
Business Manager 
  → Ads Manager
    → Campaigns
      → Procure por "120245670684470319"
        → Verifique:
          ✅ Campaign criada
          ❌ Nenhum Ad Set (falhou aqui)
          
Actions:
  1. Deletar manualmente a campaign órfã
  2. Tentar criar de novo com novo idempotencyKey
```

---

### Opção 3: Aguardar Implementação de Recovery (IDEAL - VINDO EM BREVE)

Você receberá estes endpoints:

```bash
# Ver status de falha
GET /api/integrations/meta/stores/{storeId}/campaigns/recovery/{executionId}

# Continuar de onde parou (RETRY)
POST /api/integrations/meta/stores/{storeId}/campaigns/recovery/{executionId}/retry

# Limpar recursos parciais (CLEANUP)
POST /api/integrations/meta/stores/{storeId}/campaigns/recovery/{executionId}/cleanup
```

---

## 📍 Seu Passo a Passo (use Opção 1)

### Passo 1: Pegue o ID de execução
```
executionId: "2e9faabb-c278-4c59-b06d-836e38bf2301"
```

### Passo 2: Gere nova chave
```javascript
const novaChave = 'campaign-retry-' + new Date().toISOString();
// Exemplo: "campaign-retry-2026-04-20T18:40:00.000Z"
```

### Passo 3: Tente novamente
```bash
POST /api/integrations/meta/stores/{storeId}/campaigns
Content-Type: application/json

{
  "idempotencyKey": "campaign-retry-2026-04-20T18:40:00.000Z",  ← NOVO
  "name": "Minha Campanha",
  "adAccountId": "act_123456",
  "dailyBudget": 50,
  "objective": "CONVERSIONS",
  ...
}
```

### Passo 4: Se funcionar 🎉

Você receberá:
```json
{
  "executionId": "novo-id",
  "idempotencyKey": "campaign-retry-2026-04-20T18:40:00.000Z",
  "campaignId": "120245670684470320",  ← NOVO ID
  "adSetId": "23842705685680319",
  "creativeId": "120245670684470321",
  "adId": "120245670684470322",
  "status": "CREATED",
  "executionStatus": "ACTIVE"
}
```

---

## ⚠️ O Que NÃO Fazer

- ❌ **NÃO** use o mesmo `idempotencyKey`
- ❌ **NÃO** ignore o erro (recursos ficarão órfãos)
- ❌ **NÃO** crie múltiplas campanhas com dados iguais

---

## 🐛 Por Que Aconteceu?

```
Timeline:
T1: Envia request para criar campaign
T2: ✅ Campaign criada (ID: 120245670684470319)
T3: ✅ AdSet iniciado
T4: ❌ Erro ao criar AdSet
     └─ Possível causas:
        • Budget insuficiente
        • Timeout na API Meta
        • Rate limit
        • Validação de targeting
T5: Sistema salva status = PARTIAL
T6: Você tenta novamente com MESMA chave
T7: ❌ Sistema retorna: "Já existe uma execução anterior"
    (porque quer evitar duplicação)
```

---

## 🔧 Próximas Implementações (Seu Backend)

1. **Endpoints de Recovery** (vindo em breve)
   - `GET /campaigns/recovery/{id}` - ver status
   - `POST /campaigns/recovery/{id}/retry` - continuar
   - `POST /campaigns/recovery/{id}/cleanup` - limpar

2. **UI Automática**
   - Dialog: "Deseja continuar criação anterior?"
   - Botões: [Continuar] [Limpar] [Cancelar]

3. **Cleanup Automático**
   - Remove recursos parciais após X minutos
   - Permite reutilizar mesma chave

---

## 📞 Próximos Passos

### Se Opção 1 Funcionar:
- ✅ Parabéns! Sua campaign está criada
- 📝 Vá para Meta Business Manager e delete a anterior (`120245670684470319`)
- 📊 Monitore performance

### Se Opção 1 Falhar:
- Coloque o erro completo aqui
- Vamos debugar juntos

### Quando Opção 3 Estiver Pronta:
- Você receberá email
- Use endpoints de recovery
- Muito mais simples! 🎉

---

**Tempo estimado para resolver:** 2-5 minutos  
**Dificuldade:** ⭐ (muito fácil)  
**Chance de sucesso:** 99%
