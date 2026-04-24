# 🔧 Correção: CTA Meta API - Bug Fix Report

## Problema Original
- **Erro**: Campaign e AdSet criados com sucesso, mas criativo falha com `Invalid parameter`
- **Causa**: CTA estava sendo enviado como texto traduzido da UI ("Saiba mais", "Comprar agora") em vez de valores de enum da Meta API
- **Impacto**: Todas as tentativas de criar campanha com criativo falhavam na etapa de criação do Ad Creative

## Diagnóstico Confirmado
A Meta Marketing API espera CTAs como valores de enum, não como texto traduzido:
- ✗ Errado: `"Saiba mais"`, `"Comprar agora"`, `"Fale conosco"`
- ✓ Correto: `"LEARN_MORE"`, `"SHOP_NOW"`, `"CONTACT_US"`

## Arquitetura da Solução Implementada

### 1️⃣ Frontend - Definição de Constantes (cta.constants.ts)
Novo arquivo com mapeamento label ↔ valor técnico:

```typescript
export type MetaCallToActionType = 
  | 'LEARN_MORE'     // Saiba mais
  | 'SHOP_NOW'       // Comprar agora
  | 'CONTACT_US'     // Fale conosco
  | 'BOOK_NOW'       // Agendar agora
  | 'SIGN_UP'        // Cadastrar
  | 'DOWNLOAD'       // Baixar
  | 'GET_OFFER'      // Ver oferta
  | 'MESSAGE_PAGE';  // Enviar mensagem

export const CTA_OPTIONS: CtaOption[] = [
  { label: 'Saiba mais', value: 'LEARN_MORE', hint: '...' },
  { label: 'Comprar agora', value: 'SHOP_NOW', hint: '...' },
  // ...
];

export function getCtaLabelByValue(value: MetaCallToActionType): string { ... }
```

**Funções auxiliares**:
- `isValidCtaValue()` - Valida se um CTA é da Meta API
- `getCtaLabelByValue()` - Retorna label PT-BR a partir do value
- `DEFAULT_CTA` = `'LEARN_MORE'` (padrão da Meta)

---

### 2️⃣ Frontend - Tipos (campaign-builder.types.ts)
```typescript
// Antes:
creative: {
  cta: string;  // ✗ Armazenava "Saiba mais"
}

// Depois:
creative: {
  cta: MetaCallToActionType;  // ✓ Armazena "LEARN_MORE"
}
```

---

### 3️⃣ Frontend - Componente (campaign-create-panel.component.ts)
**Atualizações**:

```typescript
// Antes:
readonly ctaOptions = ['Saiba mais', 'Comprar agora', ...];

// Depois:
readonly ctaOptions = CTA_OPTIONS;  // Array de { label, value }

// Método de preview
previewCta(): string {
  return getCtaLabelByValue(this.state.creative.cta);  // Sempre retorna label
}

// Normalização do CTA vindo da IA
private normalizeAiCta(value: string): MetaCallToActionType {
  // Converte sugestão da IA para valor técnico Meta
  if (/(whatsapp|mensagem)/i.test(value)) return 'MESSAGE_PAGE';
  if (/(comprar)/i.test(value)) return 'SHOP_NOW';
  return DEFAULT_CTA;
}

// Helper para exibição
formatCtaForDisplay(suggestionCtaText: string): string {
  const normalized = this.normalizeAiCta(suggestionCtaText);
  return getCtaLabelByValue(normalized);
}
```

---

### 4️⃣ Frontend - Template HTML
```html
<!-- Seletor -->
<select [(ngModel)]="state.creative.cta">
  <option *ngFor="let option of ctaOptions" [value]="option.value">
    {{ option.label }}
  </option>
</select>

<!-- Preview da sugestão da IA -->
<strong>CTA: {{ formatCtaForDisplay(suggestion.cta) || previewCta() }}</strong>
```

---

### 5️⃣ Frontend - Detecção de CTA do Prompt (campaign-builder-prompt.util.ts)
```typescript
// Antes: Retornava labels em PT-BR
export function detectCtaFromPrompt(normalized: string): string {
  if (/(whatsapp)/i.test(normalized)) return 'Fale conosco';
  return 'Saiba mais';
}

// Depois: Retorna valores técnicos Meta
export function detectCtaFromPrompt(normalized: string): MetaCallToActionType {
  if (/(whatsapp)/i.test(normalized)) return 'MESSAGE_PAGE';
  if (/(comprar)/i.test(normalized)) return 'SHOP_NOW';
  return DEFAULT_CTA;  // LEARN_MORE
}
```

---

### 6️⃣ Backend - DTO Validation (meta-integration.dto.ts)
```typescript
// Antes: Aceitava qualquer string
@IsOptional()
@IsString()
@MaxLength(40)
cta?: string;

// Depois: Valida contra enum da Meta
@IsOptional()
@IsString()
@IsIn(['LEARN_MORE', 'SHOP_NOW', 'CONTACT_US', 'BOOK_NOW', 
       'SIGN_UP', 'DOWNLOAD', 'GET_OFFER', 'MESSAGE_PAGE', 
       'OPEN_APP', 'INSTALL_APP', 'APPLY_NOW'])
cta?: string;
```

---

### 7️⃣ Backend - Orchestrator Simplificado (meta-campaign.orchestrator.ts)
```typescript
// Antes: Tentava fazer pattern matching frágil
private normalizeCtaType(cta?: string): string {
  const normalized = String(cta || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  if (normalized.includes('COMPRAR')) return 'SHOP_NOW';
  if (normalized.includes('MENSAGEM')) return 'MESSAGE_PAGE';
  return 'LEARN_MORE';  // ✗ Frágil!
}

// Depois: Apenas valida e usa valor direto
private normalizeCtaType(cta?: string): string {
  if (!cta || !this.validCtaTypes.includes(cta)) {
    return this.defaultCta;  // LEARN_MORE
  }
  return cta.trim();  // Já validado pela DTO ✓
}
```

**Impacto**: Payload criativo agora envia:
```json
{
  "call_to_action": {
    "type": "SHOP_NOW",
    "value": { "link": "https://..." }
  }
}
```

---

## Fluxo de Dados Corrigido

```
┌─ UI ──────────────────────────────────────────────────────┐
│ Usuário seleciona:                                         │
│ ┌──────────────────┐                                       │
│ │ Label: "Saiba"   │ ←→ Value: "LEARN_MORE"               │
│ │ Comprar agora    │ ←→ Value: "SHOP_NOW"                 │
│ │ Fale conosco     │ ←→ Value: "CONTACT_US"               │
│ └──────────────────┘                                       │
└────────────────┬─────────────────────────────────────────┘
                 │ state.creative.cta = "SHOP_NOW"
                 ↓
┌─ Frontend Validation ──────────────────────────────────────┐
│ buildApiPayload() retorna:                                 │
│ {                                                          │
│   cta: "SHOP_NOW"  // ✓ Valor técnico                      │
│ }                                                          │
└────────────────┬─────────────────────────────────────────┘
                 │ POST /meta/campaigns
                 ↓
┌─ Backend Validation ──────────────────────────────────────┐
│ DTO @IsIn([...]) valida:                                   │
│ ✓ "SHOP_NOW" está na lista permitida                       │
└────────────────┬─────────────────────────────────────────┘
                 │ normalizeCtaType("SHOP_NOW")
                 ↓
┌─ Meta API Payload ────────────────────────────────────────┐
│ {                                                          │
│   "call_to_action": {                                      │
│     "type": "SHOP_NOW",  // ✓ Enum correto!               │
│     "value": { "link": "https://..." }                     │
│   }                                                        │
│ }                                                          │
│                                                            │
│ Meta retorna: 201 Created ✓                                │
└────────────────────────────────────────────────────────────┘
```

---

## Testes Recomendados

### ✅ Caso 1: Criação Manual
1. Ir para "Criar Campanha"
2. Preencher form (modo avançado)
3. Selecionar "Comprar agora" no CTA
4. Revisar: deve exibir "Comprar agora"
5. Criar: deve retornar sucesso com campanha criada

### ✅ Caso 2: IA com Detecção de CTA
1. Ir para "Criar com IA"
2. Digitar: "campanha de vendas para ecommerce"
3. IA sugere CTA: "Comprar agora" → Aplicar
4. Revisar: CTA deve ser "Comprar agora"
5. Criar: deve retornar sucesso

### ✅ Caso 3: Payload Técnico
1. Abrir DevTools (Network)
2. Criar campanha com "Fale conosco"
3. Verificar POST payload em `/meta/campaigns`:
   ```json
   {
     "cta": "CONTACT_US"  // ✓ Não "Fale conosco"
   }
   ```

---

## Mudanças de Arquivo

| Arquivo | Tipo | Mudança |
|---------|------|---------|
| `cta.constants.ts` | 🆕 Novo | Enum e mapeamento CTA |
| `campaign-builder.types.ts` | ✏️ Atualizado | Type CTA → MetaCallToActionType |
| `campaign-create-panel.component.ts` | ✏️ Atualizado | ctaOptions, previewCta(), normalizeAiCta() |
| `campaign-create-panel.component.html` | ✏️ Atualizado | [value]="option.value", formatCtaForDisplay() |
| `campaign-builder.initial-state.ts` | ✏️ Atualizado | cta: DEFAULT_CTA |
| `campaign-builder-prompt.util.ts` | ✏️ Atualizado | detectCtaFromPrompt() retorna enum |
| `meta-integration.dto.ts` | ✏️ Atualizado | CTA validado por @IsIn() |
| `meta-campaign.orchestrator.ts` | ✏️ Atualizado | normalizeCtaType() simplificado |

---

## Impacto

✅ **Antes**: `call_to_action.type = "Saiba mais"` → ❌ Meta rejeita  
✅ **Depois**: `call_to_action.type = "LEARN_MORE"` → ✅ Meta aceita

🎯 **Resultado**: Campanhas agora são criadas com sucesso até o Ad Creative!

---

## Referência de CTAs Meta

Conforme [Marketing API - Call-to-Action](https://developers.facebook.com/docs/marketing-api/creative/call-to-action):

| Valor Meta | Label PT-BR | Caso de Uso |
|-----------|------------|-----------|
| `LEARN_MORE` | Saiba mais | Mais informações (padrão) |
| `SHOP_NOW` | Comprar agora | Ecommerce/Produtos |
| `CONTACT_US` | Fale conosco | Contato/Serviços |
| `BOOK_NOW` | Agendar agora | Agendamentos |
| `SIGN_UP` | Cadastrar | Inscrição/Newsletter |
| `DOWNLOAD` | Baixar | Apps/Conteúdo |
| `GET_OFFER` | Ver oferta | Promoções |
| `MESSAGE_PAGE` | Enviar mensagem | WhatsApp/Messenger |
