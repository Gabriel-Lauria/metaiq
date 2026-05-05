import { Component, OnInit, inject, signal, computed, DestroyRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { switchMap, debounceTime, tap } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { AccountContextService } from '../../core/services/account-context.service';
import { UiService } from '../../core/services/ui.service';
import { AuthService } from '../../core/services/auth.service';
import { StoreContextService } from '../../core/services/store-context.service';
import { AggregatedMetrics, DashboardSummary, Insight, Role } from '../../core/models';
import { UiKpiCardComponent } from '../../core/components/ui-kpi-card.component';
import { UiStateComponent } from '../../core/components/ui-state.component';

interface ExecutiveActionItem {
  id: string;
  title: string;
  message: string;
  tone: 'danger' | 'warning' | 'info' | 'success';
}

interface ExecutiveSnapshotCard {
  id: string;
  label: string;
  value: string;
  description: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, UiKpiCardComponent, UiStateComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);
  readonly accountContext = inject(AccountContextService);
  private uiService = inject(UiService);
  private destroyRef = inject(DestroyRef);
  private auth = inject(AuthService);
  private router = inject(Router);
  storeContext = inject(StoreContextService);
  private periodSubject = new Subject<number>();

  loading = signal(true);
  error = signal<string | null>(null);
  period = signal(30);
  metrics = signal<(AggregatedMetrics & { cpc?: number }) | null>(null);
  insights = signal<Insight[]>([]);
  summary = signal<DashboardSummary | null>(null);
  lastUpdated = signal<Date | null>(null);
  hasMetricsData = computed(() => {
    const metrics = this.metrics();
    if (!metrics) return false;

    return [
      metrics.impressions,
      metrics.clicks,
      metrics.spend,
      metrics.conversions,
      metrics.revenue,
      metrics.ctr,
      metrics.cpa,
      metrics.roas,
    ].some((value) => Number(value) > 0);
  });
  hasDashboardData = computed(() => this.hasMetricsData() || this.insights().length > 0);
  hasAnyCampaigns = computed(() => (this.summary()?.counts.campaigns ?? 0) > 0);
  currentRole = computed(() => this.auth.getCurrentRole());
  isClient = computed(() => this.currentRole() === Role.CLIENT);
  isManager = computed(() => this.currentRole() === Role.MANAGER);
  isAdmin = computed(() => this.currentRole() === Role.ADMIN);
  isOperational = computed(() => this.currentRole() === Role.OPERATIONAL);
  requiresStoreContext = computed(() => this.isClient() || this.isOperational());
  isIndividual = computed(() => this.accountContext.isIndividualAccount());
  dashboardTitle = computed(() => {
    if (this.isClient()) return 'Resultados da Loja';
    if (this.isIndividual()) return 'Dashboard';
    if (this.isManager()) return 'Central do Supervisor';
    if (this.isAdmin()) return 'Visão da Empresa';
    return 'Operação da loja';
  });
  executiveSummary = computed(() => {
    const metrics = this.metrics();
    if (!metrics || !this.hasMetricsData()) {
      return this.isClient()
        ? 'Seu painel vai destacar resultado, investimento e oportunidades conforme a operação ganhar dados.'
        : 'Seu painel vai consolidar operação, leitura de resultado e alertas conforme novas campanhas forem rodando.';
    }

    if ((metrics.roas || 0) >= 4) {
      return 'O retorno do período indica boa eficiência. O foco agora é preservar o que converte e escalar com cuidado.';
    }

    if ((metrics.roas || 0) >= 2) {
      return 'A operação já mostra tração, mas ainda há espaço para refinar verba, público e criativo antes de ampliar investimento.';
    }

    return 'O painel mostra uma operação que precisa de ajuste. Priorize leitura de desperdício, revisão de criativo e correção de rota antes de escalar.';
  });
  executiveFocus = computed(() => {
    const metrics = this.metrics();
    if (!metrics || !this.hasMetricsData()) {
      return this.isClient() ? 'Organizar a base da operação' : 'Ganhar tração com dados confiáveis';
    }

    if ((metrics.cpa || 0) > 0 && metrics.cpa <= 40) {
      return 'Preservar eficiência de aquisição';
    }

    if ((metrics.roas || 0) >= 3) {
      return 'Escalar com controle';
    }

    return 'Reduzir desperdício e corrigir alocação';
  });
  executiveRevenueLabel = computed(() => {
    const metrics = this.metrics();
    if (!metrics || !this.hasMetricsData()) {
      return this.isClient() ? 'Painel pronto para acompanhar resultado' : 'Base pronta para leitura de performance';
    }

    if ((metrics.revenue || 0) > 0) {
      return `Receita observada: ${this.fmt(metrics.revenue)}`;
    }

    return 'Ainda sem receita atribuída no período';
  });
  attentionItems = computed<ExecutiveActionItem[]>(() => {
    const summary = this.summary();
    const metrics = this.metrics();
    const items: ExecutiveActionItem[] = [];

    if (!summary || !metrics || !this.hasMetricsData()) {
      items.push({
        id: 'setup-base',
        title: 'Estruturar a base operacional',
        message: 'Conecte a Meta, selecione a store certa e publique a primeira campanha para transformar o dashboard em leitura executiva real.',
        tone: 'info',
      });
      items.push({
        id: 'upload-assets',
        title: 'Enviar assets antes do builder',
        message: 'Suba imagens e criativos para reduzir ruído na criação e evitar retrabalho na publicação.',
        tone: 'warning',
      });
      return items;
    }

    if ((metrics.ctr || 0) < 1) {
      items.push({
        id: 'low-ctr',
        title: 'CTR abaixo do ideal',
        message: 'Revise criativo, headline e promessa principal antes de ampliar investimento.',
        tone: 'danger',
      });
    }

    if ((metrics.cpa || 0) > 80) {
      items.push({
        id: 'high-cpa',
        title: 'CPA acima do esperado',
        message: 'Ajuste público, oferta ou página de destino para recuperar eficiência sem escalar desperdício.',
        tone: 'warning',
      });
    }

    if (summary.highlights.attention) {
      items.push({
        id: `attention-${summary.highlights.attention.id}`,
        title: `Atenção em ${summary.highlights.attention.name}`,
        message: 'A campanha mais sensível do período merece revisão prioritária antes do próximo ciclo de verba.',
        tone: 'danger',
      });
    }

    if (!items.length) {
      items.push({
        id: 'stable-operation',
        title: 'Operação estável',
        message: 'O período está consistente. Aproveite para preservar vencedoras e criar a próxima campanha com contexto.',
        tone: 'success',
      });
    }

    return items.slice(0, 3);
  });
  executiveSnapshots = computed<ExecutiveSnapshotCard[]>(() => {
    const summary = this.summary();
    const metrics = this.metrics();

    if (!summary || !metrics || !this.hasMetricsData()) {
      return [
        {
          id: 'snapshot-preparation',
          label: 'Preparação',
          value: 'Base em ativação',
          description: 'Finalize integração, assets e escopo para começar com previsibilidade.',
        },
        {
          id: 'snapshot-goal',
          label: 'Meta do momento',
          value: 'Publicar com contexto',
          description: 'O builder deixa de ser primeira tela e passa a ser etapa final do preparo.',
        },
        {
          id: 'snapshot-dashboard',
          label: 'Leitura executiva',
          value: 'Dashboard pronto',
          description: 'Assim que a operação ganhar dados, alertas e prioridades passam a aparecer aqui.',
        },
      ];
    }

    return [
      {
        id: 'best-performance',
        label: 'Melhor performance',
        value: summary.highlights.best?.name || 'Sem destaque',
        description: summary.highlights.best ? `ROAS atual do período: ${this.fmtRoas(metrics.roas)}` : 'Quando houver volume, o dashboard destaca a melhor campanha do período.',
      },
      {
        id: 'active-campaigns',
        label: 'Campanhas ativas',
        value: String(summary.counts.activeCampaigns),
        description: 'Volume ativo no período para acompanhar ritmo de entrega e priorização.',
      },
      {
        id: 'period-spend',
        label: 'Investimento do período',
        value: this.fmt(metrics.spend),
        description: 'Valor consolidado para avaliar eficiência, pacing e espaço para escalar.',
      },
    ];
  });

  constructor() {
    effect(() => {
      if (!this.requiresStoreContext()) return;
      if (!this.storeContext.loaded() || !this.storeContext.getValidSelectedStoreId()) return;
      queueMicrotask(() => this.loadData());
    });
  }

  ngOnInit(): void {
    this.storeContext.load();
    // Usar switchMap para cancelar requisições anteriores ao trocar o período
    this.periodSubject
      .pipe(
        debounceTime(100),
        tap(() => this.loading.set(true)),
        switchMap((days) =>
          this.api.getDashboardSummary(days, this.storeContext.getValidSelectedStoreId() || undefined)
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (summary) => {
          this.summary.set(summary);
          this.metrics.set(summary?.metrics ?? null);
          this.insights.set(summary?.insights ?? []);
          this.lastUpdated.set(new Date());
          this.loading.set(false);
          this.error.set(null);
        },
        error: (err) => {
          this.error.set(err?.message || 'Não foi possível carregar os dados. Tente novamente.');
          this.loading.set(false);
          this.uiService.showError('Erro ao carregar dados', err?.message || 'Não foi possível carregar os dados do dashboard.');
        },
      });

    if (!this.requiresStoreContext()) {
      this.loadData();
      return;
    }

    if (this.storeContext.loaded() && this.storeContext.getValidSelectedStoreId()) {
      this.loadData();
    }
  }

  loadData(): void {
    if (this.requiresStoreContext() && !this.storeContext.getValidSelectedStoreId()) {
      this.loading.set(false);
      this.error.set('Selecione uma loja válida para carregar o dashboard.');
      return;
    }
    this.periodSubject.next(this.period());
  }

  setPeriod(days: number): void {
    this.period.set(days);
    this.periodSubject.next(days);
  }

  setStore(storeId: string): void {
    this.storeContext.select(storeId);
    if (!this.requiresStoreContext()) {
      this.loadData();
    }
  }

  fmt(value: number): string {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  fmtPct(value: number): string {
    return `${value.toFixed(2)}%`;
  }

  fmtRoas(value: number): string {
    return `${value.toFixed(2)}x`;
  }

  get allInsights(): Insight[] {
    return this.insights();
  }

  get highlightedCampaigns() {
    return this.summary()?.highlights.campaigns ?? [];
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  kpiLabel(kind: 'spend' | 'clicks' | 'conversions' | 'ctr' | 'cpc' | 'roas'): string {
    if (this.isClient()) {
      const labels = {
        spend: 'Investimento',
        clicks: 'Visitas',
        conversions: 'Resultados',
        ctr: 'Interesse',
        cpc: 'Custo por visita',
        roas: 'Retorno',
      };
      return labels[kind];
    }

    const labels = {
      spend: 'Investimento',
      clicks: 'Cliques',
      conversions: 'Conversões',
      ctr: 'CTR',
      cpc: 'CPC',
      roas: 'ROAS',
    };
    return labels[kind];
  }

  getLastUpdatedLabel(): string {
    return this.lastUpdated() ? new Date(this.lastUpdated()!).toLocaleTimeString('pt-BR') : 'agora';
  }

  openCampaignBuilder(): void {
    this.router.navigate(['/campaigns'], {
      queryParams: {
        openCreate: 1,
        createMode: 'manual',
        ...(this.storeContext.getValidSelectedStoreId() ? { storeId: this.storeContext.getValidSelectedStoreId() } : {}),
      },
    });
  }

  openCampaigns(): void {
    this.router.navigate(['/campaigns']);
  }

  openMetrics(): void {
    this.router.navigate(['/metrics']);
  }
}
