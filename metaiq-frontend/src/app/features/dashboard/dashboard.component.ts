import { Component, OnInit, inject, signal, computed, DestroyRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
}
