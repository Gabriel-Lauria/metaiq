/**
 * PADRÃO DE REFACTORING - Melhorar Subscriptions
 * 
 * Aplicar este padrão em todos os componentes para evitar memory leaks
 */

// ❌ ANTES - Padrão antigo com memory leaks potenciais
export class CampaignListOldComponent {
  campaigns: Campaign[] = [];
  private subscriptions: Subscription[] = [];

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    // Subscription sem cleanup automático
    this.subscriptions.push(
      this.apiService.getCampaigns().subscribe(data => {
        this.campaigns = data;
      })
    );
  }

  ngOnDestroy() {
    // Fácil de esquecer
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}

// ✅ DEPOIS - Padrão moderno com takeUntilDestroyed
export class CampaignListComponent implements OnInit {
  campaigns = signal<Campaign[]>([]);
  loading = signal(false);
  
  private apiService = inject(ApiService);
  private destroyRef = inject(DestroyRef);

  ngOnInit() {
    // Cleanup automático quando componente é destruído
    this.apiService.getCampaigns()
      .pipe(
        tap(() => this.loading.set(true)),
        catchError(error => {
          console.error('Error loading campaigns:', error);
          return of([]);
        }),
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(data => {
        this.campaigns.set(data);
      });
  }
}

/**
 * Refactoring Checklist para Componentes
 */
export const COMPONENT_REFACTORING_CHECKLIST = `
## Para cada componente com ngOnInit():

1. ❌ Remover: ngOnDestroy() com unsubscribe manual
   ✅ Adicionar: DestroyRef com takeUntilDestroyed

2. ❌ Remover: this.property = data
   ✅ Adicionar: this.property = signal(data) e usar .set()

3. ❌ Remover: Subscription[]
   ✅ Adicionar: Pipe com takeUntilDestroyed()

4. ❌ Remover: OnDestroy interface
   ✅ Manter apenas: OnInit interface

Exemplo de mudança:
---
// ANTES
export class Component implements OnInit, OnDestroy {
  data: any;
  private subs = new Subscription();
  
  ngOnInit() {
    this.subs.add(this.api.getData().subscribe(d => this.data = d));
  }
  
  ngOnDestroy() {
    this.subs.unsubscribe();
  }
}

// DEPOIS
export class Component implements OnInit {
  data = signal<any>(null);
  private destroyRef = inject(DestroyRef);
  private api = inject(ApiService);
  
  ngOnInit() {
    this.api.getData()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(d => this.data.set(d));
  }
}
---

## Pattern: Async Pipe (Ainda melhor)
---
export class Component {
  data$ = this.api.getData();
}

// Template
<div>{{ data$ | async }}</div>

// Vantagens:
- Sem subscription manual
- Sem memory leaks
- Automático com ChangeDetectionStrategy.OnPush
---

## Pattern: Signals com Effect
---
export class Component {
  searchTerm = signal('');
  data = signal<any[]>([]);
  
  private api = inject(ApiService);
  
  constructor() {
    effect(() => {
      const term = this.searchTerm();
      this.api.search(term)
        .pipe(takeUntilDestroyed())
        .subscribe(results => this.data.set(results));
    });
  }
}
---
`;

/**
 * Script para encontrar padrões antigos de subscription
 */
export const FIND_OLD_PATTERNS = `
Procure no código por:
1. "ngOnDestroy" - indica componentes com cleanup manual
2. "unsubscribe()" - cleanup manual
3. "new Subscription()" - padrão antigo
4. ".subscribe(" sem pipe - falta de operadores RxJS

Comando grep:
grep -r "ngOnDestroy\|unsubscribe\|new Subscription" src/app/features --include="*.ts"
`;
