/**
 * BOAS PRÁTICAS COM RXJS E SUBSCRIPTIONS
 * 
 * Guia para evitar memory leaks e melhorar performance
 */

export const RXJS_BEST_PRACTICES = {
  /**
   * 1. takeUntilDestroyed - Desinscrever automaticamente
   */
  takeUntilDestroyed: `
    // ✅ CORRETO - Moderno (Angular 16+)
    import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
    
    export class MyComponent {
      private destroyRef = inject(DestroyRef);

      ngOnInit() {
        this.apiService.getData()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(data => {
            this.data.set(data);
          });
      }
    }
  `,

  /**
   * 2. Async Pipe - Deixar Angular gerenciar
   */
  asyncPipe: `
    // ✅ CORRETO - Usar async pipe
    export class MyComponent {
      data$ = this.apiService.getData();
    }

    <!-- Template -->
    <div>{{ data$ | async }}</div>

    // A desinscrição é automática quando o componente é destruído
  `,

  /**
   * 3. Signals - Melhor alternativa para estado local
   */
  signals: `
    // ✅ MODERNO - Usar Signals quando possível
    export class CampaignsComponent {
      campaigns = signal<Campaign[]>([]);
      loading = signal(true);
      
      constructor(private api = inject(ApiService)) {
        this.api.getCampaigns()
          .pipe(takeUntilDestroyed())
          .subscribe(data => this.campaigns.set(data));
      }
    }
  `,

  /**
   * 4. switchMap vs mergeMap
   */
  switchMap: `
    // ✅ CORRETO - switchMap cancela requisições antigas
    searchCampaigns$ = this.searchTerm$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(term => this.api.search(term))
    );

    // ❌ EVITAR - mergeMap pode gerar múltiplas requisições
    searchCampaigns$ = this.searchTerm$.pipe(
      debounceTime(300),
      mergeMap(term => this.api.search(term)) // Não cancela
    );
  `,

  /**
   * 5. Unsubscribe Pattern Antigo (deprecado)
   */
  unsubscribeOld: `
    // ❌ EVITAR - Padrão antigo com manual unsubscribe
    private subscription: Subscription;
    
    ngOnInit() {
      this.subscription = this.api.getData().subscribe(...);
    }
    
    ngOnDestroy() {
      this.subscription.unsubscribe(); // Fácil esquecer
    }
  `,

  /**
   * 6. Subject e Completion
   */
  subjectCompletion: `
    // ✅ CORRETO - Subject com completa automático
    private destroy$ = new Subject<void>();
    
    constructor() {
      effect(() => {
        onCleanup(() => this.destroy$.next());
      });
    }

    ngOnInit() {
      this.api.getData()
        .pipe(takeUntil(this.destroy$))
        .subscribe(data => {
          this.data = data;
        });
    }
  `,

  /**
   * 7. Error Handling Robusto
   */
  errorHandling: `
    // ✅ CORRETO - Tratamento de erro com retry
    this.api.getData()
      .pipe(
        retry({ count: 3, delay: 1000 }),
        catchError(error => {
          console.error('Erro ao carregar:', error);
          return of(null);
        }),
        takeUntilDestroyed()
      )
      .subscribe(data => {
        this.data.set(data || []);
      });
  `,

  /**
   * 8. Evitar Common Mistakes
   */
  avoidMistakes: `
    // ❌ EVITAR - Subscribe em subscribe
    this.api.getCampaigns().subscribe(campaigns => {
      this.api.getMetrics(campaigns[0].id).subscribe(metrics => {
        // Aninhamento desnecessário
      });
    });

    // ✅ CORRETO - Usar flatMap/switchMap
    this.api.getCampaigns().pipe(
      switchMap(campaigns => this.api.getMetrics(campaigns[0].id)),
      takeUntilDestroyed()
    ).subscribe(metrics => {
      this.metrics.set(metrics);
    });

    // ✅ MELHOR - Usar async pipe
    metrics$ = this.getCampaigns$().pipe(
      switchMap(campaigns => this.api.getMetrics(campaigns[0].id))
    );
  `,

  /**
   * 9. Operators de Combinação
   */
  combineOperators: `
    // ✅ CORRETO - Combinar múltiplas observables
    data$ = combineLatest([
      this.campaigns$,
      this.filters$,
      this.searchTerm$
    ]).pipe(
      switchMap(([campaigns, filters, term]) => 
        this.api.search(campaigns, filters, term)
      ),
      takeUntilDestroyed()
    );
  `
};

/**
 * Checklist para Subscriptions
 */
export const SUBSCRIPTIONS_CHECKLIST = [
  '✅ Usar takeUntilDestroyed em ngOnInit',
  '✅ Usar async pipe em templates quando possível',
  '✅ Usar Signals para estado local',
  '✅ Usar switchMap para cancelar requisições antigas',
  '✅ Tratar erros com catchError ou retry',
  '❌ Não deixar subscriptions sem cleanup',
  '❌ Não aninharse múltiplos subscribes',
  '❌ Não esquecer de unsubscribe em ngOnDestroy'
];
