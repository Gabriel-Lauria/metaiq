# MetaIQ Frontend - Guia Completo de Melhorias

## 📊 Visão Geral das Implementações

Este documento resume todas as melhorias implementadas no frontend da MetaIQ e como utilizá-las.

---

## 🚀 Quick Start

### Instalação e Execução

```bash
# Instalar dependências
npm install

# Desenvolvimento
npm start                    # localhost:4200

# Testes
npm test                     # Modo watch
npm run test:coverage       # Com relatório de cobertura

# Build
npm run build               # Desenvolvimento
npm run build:prod          # Produção

# Verificar antes de deploy
bash pre-deploy.sh
```

---

## ✅ Melhorias Implementadas

### 1. **TypeScript Stricto** ✅
- Removido `baseUrl` deprecado
- Removido `downlevelIteration` deprecado
- Ativado `strictTemplates: true`
- Adicionados `paths` para imports limpos

**Benefício**: Erros detectados em tempo de compilação

### 2. **Segurança (CSP Headers)** ✅
- Content-Security-Policy
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy

**Benefício**: Proteção contra XSS, clickjacking e outras vulnerabilidades

**Como verificar**: Abra DevTools → Network → Response Headers

### 3. **Dark/Light Theme Mode** ✅
- Alternância automática de temas
- Persistência em localStorage
- Sincronização com preferência do SO
- Transições suaves

**Como usar**:
```html
<!-- Adicione em qualquer lugar -->
<app-theme-toggle></app-theme-toggle>
```

**Arquivo**: `src/app/core/components/theme-toggle.component.ts`

### 4. **Testes Automatizados** ✅
- Jasmine + Karma
- Testes unitários implementados
- Coverage reports

**Como executar**:
```bash
npm test                  # Modo watch
npm run test:coverage    # Gera relatório em coverage/
```

**Arquivo de configuração**: `karma.conf.js`

### 5. **Virtual Scrolling** ✅
- Componente para listas grandes
- Suporta 1000+ itens sem lag

**Como usar**:
```html
<app-virtual-list 
  [items]="campaigns" 
  [itemHeight]="80"
  containerHeight="600px">
  <ng-template #itemTemplate let-item>
    <div class="item">{{ item.name }}</div>
  </ng-template>
</app-virtual-list>
```

**Arquivo**: `src/app/core/components/virtual-list.component.ts`

### 6. **Sentry Error Tracking** ✅
- Rastreamento automático de erros
- Breadcrumb tracking
- Release tracking

**Como configurar**:
1. Adicione `SENTRY_DSN` ao ambiente
2. Sentry iniciará automaticamente em produção

**Arquivo**: `src/app/core/monitoring/sentry.config.ts`

### 7. **Google Analytics** ✅
- Rastreamento de página views
- Eventos customizados
- Propriedades do usuário

**Como usar**:
```typescript
export class MyComponent {
  constructor(private analytics = inject(AnalyticsService)) {}

  onEvent() {
    this.analytics.trackEvent('my_event', 'category', 'label');
  }
}
```

**Arquivo**: `src/app/core/services/analytics.service.ts`

### 8. **Lazy Loading e Performance** ✅
- Lazy loading de rotas
- Code splitting
- Preloading de rotas críticas

**Como verificar**: Abra DevTools → Network → veja chunks sendo carregados

### 9. **Documentação Completa** ✅
- Guias de boas práticas
- Padrões de design
- Checklist de implementação

**Arquivos**:
- `IMPROVEMENTS_SUMMARY.md` - Resumo completo
- `REFACTORING_GUIDE.md` - Como refatorar código antigo
- `src/app/core/optimization/PERFORMANCE.md` - Otimizações
- `src/app/core/rxjs/RXJS_BEST_PRACTICES.md` - RxJS patterns

---

## 🔧 Configurações Importantes

### Paths Alias para Imports

No `tsconfig.json` foi adicionado:

```typescript
"paths": {
  "@app/*": ["src/app/*"],
  "@core/*": ["src/app/core/*"],
  "@features/*": ["src/app/features/*"]
}
```

**Uso**:
```typescript
// Antes
import { UiService } from '../../../core/services/ui.service';

// Depois
import { UiService } from '@core/services/ui.service';
```

### Environment Variables

Crie um arquivo `.env.local` baseado em `.env.example`:

```bash
cp .env.example .env.local
```

Preencha os valores:
- `SENTRY_DSN` - Para error tracking
- `GA_MEASUREMENT_ID` - Para analytics
- `META_APP_ID` - Para integração Meta

---

## 📚 Documentação por Tópico

### Memory Leaks e Subscriptions

**Problema**: Subscriptions não desinscritas causam memory leaks

**Solução**: Use `takeUntilDestroyed`

```typescript
export class MyComponent {
  private destroyRef = inject(DestroyRef);
  private api = inject(ApiService);

  ngOnInit() {
    this.api.getData()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => {
        // process data
      });
  }
}
```

**Ver documentação**: `src/app/core/rxjs/RXJS_BEST_PRACTICES.md`

### Performance Optimization

**Dicas**:
1. Use `ChangeDetectionStrategy.OnPush` quando possível
2. Lazy load rotas grandes
3. Use virtual scrolling para listas > 500 itens
4. Minifique images
5. Use async pipe em templates

**Ver documentação**: `src/app/core/optimization/PERFORMANCE.md`

### Security Best Practices

**Implementado**:
- CSP Headers
- XSS Protection
- CSRF Token (em interceptor)
- SQL Injection Prevention (backend)
- Rate Limiting (error interceptor)

**Verificar**: Abra DevTools e procure por headers de segurança

---

## 🧪 Testes

### Rodar Testes

```bash
# Modo watch (desenvolvimento)
npm test

# Uma única execução
npm test -- --watch=false

# Com coverage
npm run test:coverage

# Abrir relatório de cobertura
open coverage/metaiq-frontend/index.html
```

### Criar Novo Teste

**Arquivo**: `src/app/features/my-feature/my.component.spec.ts`

```typescript
import { TestBed } from '@angular/core/testing';
import { MyComponent } from './my.component';

describe('MyComponent', () => {
  let component: MyComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyComponent]
    }).compileComponents();

    component = TestBed.createComponent(MyComponent).componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should do something', () => {
    // test logic
  });
});
```

---

## 🌙 Dark Mode

### Como Habilitar

```html
<!-- No app.component.html -->
<app-theme-toggle></app-theme-toggle>
```

### CSS Variables

Todos os componentes podem usar CSS variables:

```scss
// Light theme
.my-component {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

// Automaticamente funciona em dark mode também!
```

---

## 📊 Observabilidade

### Sentry

```typescript
import { captureException, addBreadcrumb } from '@core/monitoring/sentry.config';

// Capturar erro
try {
  // code
} catch (error) {
  captureException(error as Error, { context: 'my_function' });
}

// Adicionar breadcrumb para debug
addBreadcrumb('User clicked button', 'user-interaction');
```

### Analytics

```typescript
export class CampaignsComponent {
  constructor(private analytics = inject(AnalyticsService)) {}

  onCampaignCreated(id: string) {
    this.analytics.trackCampaignCreated(id);
  }

  onError(message: string) {
    this.analytics.trackError(message, 'campaigns');
  }
}
```

---

## 🚀 Deploy para Produção

### Pre-Deploy Checklist

```bash
bash pre-deploy.sh
```

Verifica:
- ✅ Dependencies instaladas
- ✅ Build bem-sucedido
- ✅ Bundle size < 500KB
- ✅ TypeScript errors
- ✅ Security headers
- ✅ Environment variables

### Build para Produção

```bash
npm run build:prod

# Output: dist/metaiq-frontend/
```

### Deploy

```bash
# Com seu provedor favorito
# Exemplo: Vercel, Netlify, Firebase, AWS S3, etc.

# Configurar variáveis de ambiente em produção:
export SENTRY_DSN=your-dsn
export GA_MEASUREMENT_ID=your-ga-id
```

---

## 📋 Checklist de Implementação para Componentes Novos

Ao criar um novo componente, lembre-se de:

- [ ] Usar `standalone: true`
- [ ] Usar `ChangeDetectionStrategy.OnPush`
- [ ] Injetar `DestroyRef` para subscriptions
- [ ] Usar `takeUntilDestroyed` em observables
- [ ] Usar Signals para estado local
- [ ] Criar arquivo `.spec.ts` com testes
- [ ] Adicionar comentários JSDoc
- [ ] Usar semantic HTML e ARIA labels
- [ ] Testar em light e dark mode
- [ ] Otimizar performance (virtual scrolling se necessário)

---

## 🐛 Troubleshooting

### Build falha com TypeScript errors

```bash
# Verificar erros
npx tsc --noEmit

# Limpar cache
rm -rf node_modules dist
npm install
npm run build
```

### Testes não funcionam

```bash
# Reinstalar dependências de teste
npm install --save-dev jasmine-core karma

# Rodar com verbose
npm test -- --browsers=Chrome --log-level=DEBUG
```

### Dark mode não ativa

```typescript
// Verificar se ThemeService está inicializado em main.ts
import { ThemeService } from '@core/theme/theme.service';
ThemeService.initialize();
```

### Sentry não captura erros

```typescript
// Verificar se DSN está configurado
console.log(import.meta.env.VITE_SENTRY_DSN);

// Em desenvolvimento, desabilitado por padrão
// Ver: src/app/core/monitoring/sentry.config.ts
```

---

## 📞 Suporte e Recursos

### Documentação Importante

- [Angular Docs](https://angular.io/docs)
- [RxJS Docs](https://rxjs.dev/)
- [TypeScript Docs](https://www.typescriptlang.org/docs/)

### Arquivos de Referência

- `IMPROVEMENTS_SUMMARY.md` - Resumo completo
- `REFACTORING_GUIDE.md` - Padrões de refactoring
- `src/app/core/optimization/PERFORMANCE.md` - Performance
- `src/app/core/rxjs/RXJS_BEST_PRACTICES.md` - RxJS patterns
- `cypress.e2e.ts` - Exemplos de E2E tests

---

## 🎯 Roadmap Futuro

### Próximas Prioridades

1. **Cypress E2E Tests** - Implementação completa
2. **Service Worker** - Offline support
3. **HTTP Caching** - Interceptor de cache
4. **Storybook** - Documentação de componentes
5. **Lighthouse** - Performance monitoring

### Métricas de Sucesso

- [ ] Lighthouse Score > 90
- [ ] Build Size < 500KB gzipped
- [ ] Tests Coverage > 80%
- [ ] Accessibility Score 100
- [ ] Zero security vulnerabilities

---

**Versão**: 1.0.0  
**Última atualização**: April 20, 2026  
**Status**: ✅ Production Ready

Para dúvidas ou sugestões, abra uma issue no repositório.
