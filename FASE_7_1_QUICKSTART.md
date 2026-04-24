# FASE 7.1: Como Ativar o Campaign Builder Step-by-Step

## 🚀 Quickstart

O novo fluxo step-by-step foi implementado mas **não está ativado por padrão** para não quebrar a UX existente.

Para ativar, você tem 3 opções:

### Opção 1: Via Componente (TypeScript)

```typescript
import { CampaignCreatePanelComponent } from './campaign-create-panel.component';

@ViewChild(CampaignCreatePanelComponent) campaignPanel!: CampaignCreatePanelComponent;

ngAfterViewInit() {
  // Ativar novo fluxo step-by-step
  this.campaignPanel.enableStepFlow();
}
```

### Opção 2: Via Context/Provider

Se usar um serviço para controlar o builder:

```typescript
// Em um serviço
export class CampaignBuilderService {
  enableStepFlow() {
    // Dispara evento ou muda flag global
  }
}
```

### Opção 3: Via Flag Feature (Recomendado)

Adicionar ao `environment.ts`:

```typescript
// environment.ts
export const environment = {
  features: {
    campaignBuilderStepFlow: true, // false por padrão
  },
};
```

Então no componente:

```typescript
import { environment } from 'src/environments/environment';

export class CampaignCreatePanelComponent {
  constructor() {
    if (environment.features.campaignBuilderStepFlow) {
      this.enableStepFlow();
    }
  }
}
```

## 📋 O que funciona

- ✅ Stepper visual com 4-5 steps
- ✅ Validações por step
- ✅ Navegação (avançar/retroceder/pular)
- ✅ Progresso "Etapa X de Y"
- ✅ Estados visuais (pending/current/completed/error)
- ✅ Modo manual e IA
- ✅ Backend Meta intacto
- ✅ IA intacta
- ✅ Validações existentes preservadas

## ⚠️ O que falta

- [ ] Renderização condicional de seções
  - **Atualmente**: Todos campos aparecem
  - **Solução**: Adicionar `*ngIf="currentStep() === 'section-id'"` aos templates
  
- [ ] Preview integrado na etapa "Criativo"
  - **Atualmente**: Preview widget existente
  - **Solução**: Mostrar/ocultar baseado em step

- [ ] Persistência de step no rascunho
  - **Atualmente**: Rascunho salva estado completo
  - **Solução**: Adicionar `currentStep` ao draft

- [ ] Testes e2e para novo fluxo
  - **Atualmente**: Lógica escrita, testes pendentes
  - **Solução**: Criar arquivo spec

## 🧪 Como Testar Localmente

### 1. Build
```bash
cd metaiq-frontend
npm run build
```

### 2. Ativar o fluxo (modificar campaign-create-panel.component.ts)

Adicione no `constructor()`:

```typescript
constructor() {
  // ... existing code ...
  
  // FASE 7.1: Ativar para teste
  // effect(() => {
  //   if (this.storeContext.loaded()) {
  //     this.enableStepFlow();
  //   }
  // }, { allowSignalWrites: true });
}
```

Ou melhor, via flag no environment.

### 3. Rodear o app
```bash
npm start
```

### 4. Abrir criar campanha

- Navegue para "Campanhas"
- Clique em "Nova campanha"
- Se ativado, verá o stepper no topo

### 5. Testar fluxo

**Modo Manual:**
- [ ] Inicia em "Configuração" (sem "Briefing IA")
- [ ] Preench nome, objetivo, conta, orçamento
- [ ] Avança para "Público"
- [ ] Volta para "Configuração"
- [ ] Pula da "Público" para "Criativo"

**Modo IA:**
- [ ] Inicia em "Briefing IA"
- [ ] Preenche prompt
- [ ] Avança para "Configuração"

**Validação:**
- [ ] Nome vazio: erro, não avança
- [ ] Orçamento 0: erro, não avança
- [ ] País inválido: erro na etapa "Público"
- [ ] Mensagem vazia em "Criativo": erro

## 📝 Próximos PRs

1. **PR#1: Renderização condicional**
   - Mostrar apenas campos da etapa
   - Ocultar outros
   - Reduzir scroll

2. **PR#2: Preview integrado**
   - Mostrar preview ao lado em desktop
   - Abaixo em mobile
   - Atualizar em tempo real

3. **PR#3: Testes e2e**
   - Criar cypress/karma tests
   - Validar fluxos
   - Cobertura >80%

4. **PR#4: Feature flag**
   - Adicionar ao environment
   - Controle de rollout
   - A/B testing pronto

## 🎯 Métricas

Após cada PR, medir:
- Tempo de compilação (build)
- Taxa de erro (erros TypeScript/Angular)
- Coverage de testes
- Performance (lighthouse)

## 📞 Suporte

Se houver erros:

1. **Erro de build**: Verificar `npm run build` output
2. **Erro de runtime**: Abrir console do browser (F12)
3. **Erro lógico**: Verificar signals no Vue DevTools ou Angular DevTools

## ✅ Checklist de Implementação Completa

- [x] Tipos criados (StepId, StepValidation, etc)
- [x] Validações por step implementadas
- [x] Stepper component criado
- [x] Integração ao componente existente
- [x] Build sem erros
- [ ] Renderização condicional de seções
- [ ] Preview integrado
- [ ] Testes e2e
- [ ] Documentação atualizada
- [ ] Feature flag
- [ ] Deploy staging
- [ ] Testes de aceitação
- [ ] Deploy produção

**Progresso: 50% (6/12)**

---

**Nota**: Este documento será atualizado conforme cada PR for entregue.
