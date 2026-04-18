import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChartConfiguration, ChartData } from 'chart.js';
import { ApiService } from '../../core/services/api.service';
import { StoreContextService } from '../../core/services/store-context.service';
import { AggregatedMetrics } from '../../core/models';
import { ChartComponent } from '../../core/components/chart.component';
import { UiKpiCardComponent } from '../../core/components/ui-kpi-card.component';
import { UiStateComponent } from '../../core/components/ui-state.component';

interface CampaignMetricsRow {
  id: string;
  campaign: string;
  account: string;
  spend: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpc: number;
  conversions: number;
}

@Component({
  selector: 'app-metrics',
  standalone: true,
  imports: [CommonModule, FormsModule, ChartComponent, UiKpiCardComponent, UiStateComponent],
  templateUrl: './metrics.component.html',
  styleUrls: ['./metrics.component.scss'],
})
export class MetricsComponent implements OnInit {
  private api = inject(ApiService);
  storeContext = inject(StoreContextService);

  loading = signal(true);
  error = signal<string | null>(null);
  period = signal(30);
  metrics = signal<AggregatedMetrics | null>(null);
  startDate = signal(this.isoDaysAgo(30));
  endDate = signal(this.isoDaysAgo(0));
  selectedStoreId = signal('');
  selectedAdAccount = signal('Todas as contas');
  selectedCampaign = signal('Todas as campanhas');

  adAccounts = ['Todas as contas', 'Meta Ads Principal', 'Meta Ads Retargeting', 'Meta Ads Expansao'];

  campaignRows = computed<CampaignMetricsRow[]>(() => {
    const base = this.metrics();
    const spend = base?.spend || 18640;
    const conversions = base?.conversions || 412;
    const roas = base?.roas || 3.42;
    const ctr = base?.ctr || 2.8;
    const cpa = base?.cpa || 45.24;
    const clicks = base?.clicks || 8140;
    const cpc = clicks > 0 ? spend / clicks : 2.28;

    return [
      { id: 'cmp-1', campaign: 'Prospeccao Meta - Topo', account: 'Meta Ads Principal', spend: spend * 0.34, roas: roas * 1.18, cpa: cpa * 0.84, ctr: ctr * 1.16, cpc: cpc * 0.92, conversions: Math.round(conversions * 0.38) },
      { id: 'cmp-2', campaign: 'Remarketing Checkout', account: 'Meta Ads Retargeting', spend: spend * 0.27, roas: roas * 1.32, cpa: cpa * 0.76, ctr: ctr * 1.28, cpc: cpc * 0.88, conversions: Math.round(conversions * 0.31) },
      { id: 'cmp-3', campaign: 'Conversao Catalogo', account: 'Meta Ads Principal', spend: spend * 0.23, roas: roas * 0.86, cpa: cpa * 1.12, ctr: ctr * 0.91, cpc: cpc * 1.08, conversions: Math.round(conversions * 0.2) },
      { id: 'cmp-4', campaign: 'Teste Criativos Abril', account: 'Meta Ads Expansao', spend: spend * 0.16, roas: roas * 0.58, cpa: cpa * 1.46, ctr: ctr * 0.72, cpc: cpc * 1.24, conversions: Math.max(1, Math.round(conversions * 0.11)) },
    ];
  });

  filteredRows = computed(() => this.campaignRows().filter((row) => {
    const accountOk = this.selectedAdAccount() === 'Todas as contas' || row.account === this.selectedAdAccount();
    const campaignOk = this.selectedCampaign() === 'Todas as campanhas' || row.campaign === this.selectedCampaign();
    return accountOk && campaignOk;
  }));

  totals = computed(() => {
    const rows = this.filteredRows();
    const spend = rows.reduce((sum, row) => sum + row.spend, 0);
    const conversions = rows.reduce((sum, row) => sum + row.conversions, 0);
    const weighted = (field: keyof Pick<CampaignMetricsRow, 'roas' | 'ctr' | 'cpc'>) =>
      spend ? rows.reduce((sum, row) => sum + row[field] * row.spend, 0) / spend : 0;

    return {
      spend,
      conversions,
      roas: weighted('roas'),
      ctr: weighted('ctr'),
      cpc: weighted('cpc'),
      cpa: conversions ? spend / conversions : 0,
    };
  });

  bestCampaign = computed(() => [...this.filteredRows()].sort((a, b) => b.roas - a.roas)[0]);
  worstCampaign = computed(() => [...this.filteredRows()].sort((a, b) => a.roas - b.roas)[0]);

  chartOptions: ChartConfiguration['options'] = {
    plugins: { legend: { labels: { color: '#475569' } } },
    scales: {
      x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(148, 163, 184, 0.16)' } },
      y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(148, 163, 184, 0.16)' } },
    },
  };

  lineChart = computed<ChartData<'line'>>(() => ({
    labels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'],
    datasets: [
      {
        label: 'Spend',
        data: [0.18, 0.24, 0.28, 0.3].map((value) => Math.round(this.totals().spend * value)),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.14)',
        tension: 0.35,
        fill: true,
      },
      {
        label: 'Conversoes',
        data: [0.2, 0.22, 0.26, 0.32].map((value) => Math.round(this.totals().conversions * value)),
        borderColor: '#f97316',
        backgroundColor: 'rgba(249, 115, 22, 0.12)',
        tension: 0.35,
      },
    ],
  }));

  barChart = computed<ChartData<'bar'>>(() => ({
    labels: this.filteredRows().map((row) => row.campaign),
    datasets: [{ label: 'ROAS', data: this.filteredRows().map((row) => Number(row.roas.toFixed(2))), backgroundColor: '#2563eb' }],
  }));

  donutChart = computed<ChartData<'doughnut'>>(() => ({
    labels: this.filteredRows().map((row) => row.campaign),
    datasets: [{ data: this.filteredRows().map((row) => Math.round(row.spend)), backgroundColor: ['#2563eb', '#f97316', '#22c55e', '#64748b'] }],
  }));

  comparisonChart = computed<ChartData<'bar'>>(() => ({
    labels: ['Spend', 'ROAS', 'CPA', 'CTR', 'Conversoes'],
    datasets: [
      { label: 'Periodo atual', data: [100, 100, 100, 100, 100], backgroundColor: '#2563eb' },
      { label: 'Periodo anterior', data: [88, 92, 114, 81, 76], backgroundColor: '#f97316' },
    ],
  }));

  constructor() {
    effect(() => {
      if (!this.storeContext.loaded() || !this.storeContext.getValidSelectedStoreId()) return;
      this.selectedStoreId.set(this.storeContext.getValidSelectedStoreId() || '');
      queueMicrotask(() => this.load());
    });
  }

  ngOnInit(): void {
    this.storeContext.load();
    if (this.storeContext.loaded() && this.storeContext.getValidSelectedStoreId()) {
      this.selectedStoreId.set(this.storeContext.getValidSelectedStoreId() || '');
      this.load();
    }
  }

  load(): void {
    const storeId = this.storeContext.getValidSelectedStoreId();
    if (!storeId) {
      this.loading.set(false);
      this.error.set('Selecione uma loja para visualizar as metricas.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.api.getMetricsSummaryForStore(this.period(), storeId).subscribe({
      next: (metrics) => {
        this.metrics.set(metrics);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Nao foi possivel carregar as metricas.');
        this.loading.set(false);
      },
    });
  }

  applyFilters(): void {
    if (this.selectedStoreId()) this.storeContext.select(this.selectedStoreId());
    this.load();
  }

  setPeriodFromDates(): void {
    const start = new Date(this.startDate()).getTime();
    const end = new Date(this.endDate()).getTime();
    const days = Math.max(1, Math.ceil((end - start) / 86400000));
    this.period.set(days);
  }

  fmtCurrency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  private isoDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().slice(0, 10);
  }
}
