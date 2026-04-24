import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChartData, ChartOptions } from 'chart.js';
import { ChartComponent } from '../../core/components/chart.component';
import { UiKpiCardComponent } from '../../core/components/ui-kpi-card.component';
import { AggregatedMetrics } from '../../core/models';
import { AccountContextService } from '../../core/services/account-context.service';
import { StoreContextService } from '../../core/services/store-context.service';

interface CampaignMetricHistory {
  date: string;
  spend: number;
  conversions: number;
}

interface MetricsCampaign {
  id: string;
  name: string;
  account: string;
  storeId: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  metrics: AggregatedMetrics & {
    cpc: number;
    history: CampaignMetricHistory[];
    previousPerformance: Partial<AggregatedMetrics>;
  };
}

interface InsightCard {
  id: string;
  title: string;
  detail: string;
}

@Component({
  selector: 'app-metrics',
  standalone: true,
  imports: [CommonModule, FormsModule, ChartComponent, UiKpiCardComponent],
  templateUrl: './metrics.component.html',
  styleUrls: ['./metrics.component.scss'],
})
export class MetricsComponent {
  readonly accountContext = inject(AccountContextService);
  readonly storeContext = inject(StoreContextService);

  readonly fromDate = signal(this.formatDateOffset(-30));
  readonly toDate = signal(this.formatDateOffset(0));
  readonly selectedStore = signal('');
  readonly selectedAccount = signal('Todas');
  readonly selectedCampaign = signal('Todas');

  readonly accounts = ['Todas', 'Conta Meta 1', 'Conta Meta 2'];

  readonly allCampaigns = signal<MetricsCampaign[]>([
    {
      id: 'cmp-1',
      name: 'Campanha Lançamento',
      account: 'Conta Meta 1',
      storeId: 'store-1',
      status: 'ACTIVE',
      metrics: {
        impressions: 620000,
        clicks: 26000,
        spend: 14200,
        conversions: 320,
        revenue: 45120,
        ctr: 4.2,
        cpa: 44.4,
        roas: 3.18,
        cpc: 0.55,
        score: 88,
        history: [
          { date: '2026-03-25', spend: 1400, conversions: 30 },
          { date: '2026-03-31', spend: 1800, conversions: 42 },
          { date: '2026-04-07', spend: 2200, conversions: 50 },
          { date: '2026-04-14', spend: 2500, conversions: 80 },
          { date: '2026-04-20', spend: 3300, conversions: 118 },
        ],
        previousPerformance: {
          impressions: 580000,
          clicks: 24500,
          spend: 13800,
          conversions: 300,
          revenue: 41600,
          ctr: 4.1,
          cpa: 46,
          roas: 3.01,
          score: 84,
        },
      },
    },
    {
      id: 'cmp-2',
      name: 'Promoção Férias',
      account: 'Conta Meta 2',
      storeId: 'store-1',
      status: 'PAUSED',
      metrics: {
        impressions: 488000,
        clicks: 19000,
        spend: 9800,
        conversions: 190,
        revenue: 23450,
        ctr: 3.9,
        cpa: 51.6,
        roas: 2.39,
        cpc: 0.52,
        score: 68,
        history: [
          { date: '2026-03-25', spend: 1200, conversions: 18 },
          { date: '2026-03-31', spend: 1600, conversions: 24 },
          { date: '2026-04-07', spend: 2200, conversions: 40 },
          { date: '2026-04-14', spend: 2400, conversions: 60 },
          { date: '2026-04-20', spend: 2400, conversions: 48 },
        ],
        previousPerformance: {
          impressions: 520000,
          clicks: 20500,
          spend: 10200,
          conversions: 210,
          revenue: 26300,
          ctr: 3.95,
          cpa: 48.6,
          roas: 2.58,
          score: 72,
        },
      },
    },
    {
      id: 'cmp-3',
      name: 'Black Friday',
      account: 'Conta Meta 1',
      storeId: 'store-2',
      status: 'ACTIVE',
      metrics: {
        impressions: 890000,
        clicks: 41000,
        spend: 21800,
        conversions: 480,
        revenue: 125000,
        ctr: 4.6,
        cpa: 45.4,
        roas: 5.73,
        cpc: 0.53,
        score: 95,
        history: [
          { date: '2026-03-25', spend: 2900, conversions: 68 },
          { date: '2026-03-31', spend: 3800, conversions: 82 },
          { date: '2026-04-07', spend: 4500, conversions: 96 },
          { date: '2026-04-14', spend: 5200, conversions: 126 },
          { date: '2026-04-20', spend: 5400, conversions: 108 },
        ],
        previousPerformance: {
          impressions: 820000,
          clicks: 37000,
          spend: 20200,
          conversions: 430,
          revenue: 113000,
          ctr: 4.5,
          cpa: 47,
          roas: 5.59,
          score: 91,
        },
      },
    },
  ]);

  readonly selectedStoreName = computed(() => {
    const store = this.storeContext.stores().find((item) => item.id === this.selectedStore());
    return store?.name || 'Todas as lojas';
  });

  readonly contextualCampaigns = computed(() => {
    const stores = this.storeContext.stores();
    if (!stores.length) {
      return this.allCampaigns();
    }

    return this.allCampaigns().map((campaign, index) => ({
      ...campaign,
      storeId: stores[index % stores.length]?.id ?? campaign.storeId,
    }));
  });

  readonly filteredCampaigns = computed(() =>
    this.contextualCampaigns().filter((campaign) => {
      const matchesStore = !this.selectedStore() || campaign.storeId === this.selectedStore();
      const matchesAccount = this.selectedAccount() === 'Todas' || campaign.account === this.selectedAccount();
      const matchesCampaign = this.selectedCampaign() === 'Todas' || campaign.name === this.selectedCampaign();
      return matchesStore && matchesAccount && matchesCampaign;
    }),
  );

  readonly aggregatedMetrics = computed(() => {
    const campaigns = this.filteredCampaigns();
    const totals = campaigns.reduce(
      (acc, campaign) => ({
        impressions: acc.impressions + campaign.metrics.impressions,
        clicks: acc.clicks + campaign.metrics.clicks,
        spend: acc.spend + campaign.metrics.spend,
        conversions: acc.conversions + campaign.metrics.conversions,
        revenue: acc.revenue + campaign.metrics.revenue,
        score: acc.score + campaign.metrics.score,
      }),
      { impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0, score: 0 },
    );

    const impressions = totals.impressions;
    const clicks = totals.clicks;
    const spend = totals.spend;
    const conversions = totals.conversions;
    const revenue = totals.revenue;
    const count = Math.max(campaigns.length, 1);

    return {
      impressions,
      clicks,
      spend,
      conversions,
      revenue,
      ctr: impressions ? +(clicks / impressions * 100).toFixed(1) : 0,
      cpa: conversions ? +(spend / conversions).toFixed(2) : 0,
      roas: spend ? +(revenue / spend).toFixed(2) : 0,
      score: +(totals.score / count).toFixed(1),
      cpc: clicks ? +(spend / clicks).toFixed(2) : 0,
    };
  });

  readonly lineChartData = computed<ChartData<'line'>>(() => {
    const grouped = new Map<string, { spend: number; conversions: number }>();

    this.filteredCampaigns()
      .flatMap((campaign) => campaign.metrics.history)
      .forEach((point) => {
        if (!grouped.has(point.date)) {
          grouped.set(point.date, { spend: 0, conversions: 0 });
        }

        const row = grouped.get(point.date)!;
        row.spend += point.spend;
        row.conversions += point.conversions;
      });

    const labels = Array.from(grouped.keys()).sort((left, right) => left.localeCompare(right));
    const points = labels.map((label) => grouped.get(label)!);

    return {
      labels,
      datasets: [
        {
          label: 'Spend',
          data: points.map((point) => point.spend),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.16)',
          fill: true,
          tension: 0.32,
        },
        {
          label: 'Conversões',
          data: points.map((point) => point.conversions),
          borderColor: '#f97316',
          backgroundColor: 'rgba(249, 115, 22, 0.16)',
          fill: true,
          tension: 0.32,
          yAxisID: 'y1',
        },
      ],
    };
  });

  readonly barChartData = computed<ChartData<'bar'>>(() => ({
    labels: this.filteredCampaigns().map((campaign) => campaign.name),
    datasets: [
      {
        label: 'Spend',
        data: this.filteredCampaigns().map((campaign) => campaign.metrics.spend),
        backgroundColor: '#2563eb',
      },
      {
        label: 'Conversões',
        data: this.filteredCampaigns().map((campaign) => campaign.metrics.conversions),
        backgroundColor: '#f97316',
      },
    ],
  }));

  readonly donutChartData = computed<ChartData<'doughnut'>>(() => ({
    labels: this.filteredCampaigns().map((campaign) => campaign.name),
    datasets: [
      {
        label: 'Distribuição de spend',
        data: this.filteredCampaigns().map((campaign) => campaign.metrics.spend),
        backgroundColor: ['#2563eb', '#f97316', '#16a34a', '#0ea5e9', '#f59e0b'],
      },
    ],
  }));

  readonly periodComparisonData = computed<ChartData<'bar'>>(() => {
    const current = this.filteredCampaigns()[0]?.metrics;
    const previous = current?.previousPerformance ?? {};

    return {
      labels: ['Spend', 'Conversões', 'Receita'],
      datasets: [
        {
          label: 'Período atual',
          data: [current?.spend ?? 0, current?.conversions ?? 0, current?.revenue ?? 0],
          backgroundColor: '#2563eb',
        },
        {
          label: 'Período anterior',
          data: [previous.spend ?? 0, previous.conversions ?? 0, previous.revenue ?? 0],
          backgroundColor: '#0ea5e9',
        },
      ],
    };
  });

  readonly insights = computed<InsightCard[]>(() => {
    const campaigns = [...this.filteredCampaigns()];
    const best = [...campaigns].sort((left, right) => right.metrics.score - left.metrics.score)[0];
    const worst = [...campaigns].sort((left, right) => left.metrics.score - right.metrics.score)[0];
    const lowRoas = campaigns.find((campaign) => campaign.metrics.roas < 2.5);
    const highCpa = campaigns.find((campaign) => campaign.metrics.cpa > 50);
    const lowCtr = campaigns.find((campaign) => campaign.metrics.ctr < 4);

    return [
      { id: 'best', title: 'Melhor campanha', detail: best ? best.name : 'Sem campanhas para analisar.' },
      { id: 'worst', title: 'Ponto de atenção', detail: worst ? `${worst.name} precisa de revisão de eficiência.` : 'Nenhum alerta no momento.' },
      { id: 'ctr', title: 'Queda de CTR', detail: lowCtr ? `${lowCtr.name} está abaixo de 4% de CTR.` : 'CTR dentro do esperado.' },
      { id: 'cpa', title: 'Aumento de CPA', detail: highCpa ? `${highCpa.name} ultrapassou a faixa saudável de CPA.` : 'CPA controlado.' },
      { id: 'roas', title: 'ROAS baixo', detail: lowRoas ? `${lowRoas.name} está abaixo da meta de retorno.` : 'ROAS dentro do alvo.' },
    ];
  });

  readonly chartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom' },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => this.formatNumber(Number(value)),
        },
      },
      y1: {
        position: 'right',
        beginAtZero: true,
        grid: { drawOnChartArea: false },
        ticks: {
          callback: (value) => this.formatNumber(Number(value)),
        },
      },
    },
  };

  constructor() {
    effect(() => {
      if (this.selectedStore() || this.storeContext.selectedStoreId()) return;
      this.selectedStore.set('');
    });

    effect(() => {
      const selectedStoreId = this.storeContext.getValidSelectedStoreId();
      if (this.accountContext.isIndividualAccount() && selectedStoreId && this.selectedStore() !== selectedStoreId) {
        this.selectedStore.set(selectedStoreId);
      }
    });
  }

  setStore(storeId: string): void {
    this.selectedStore.set(storeId);
  }

  setAccount(account: string): void {
    this.selectedAccount.set(account);
  }

  setCampaign(campaignName: string): void {
    this.selectedCampaign.set(campaignName);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }

  formatNumber(value: number): string {
    if (Math.abs(value) >= 1000) {
      return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
    }

    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
  }

  formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
  }

  formatRoas(value: number): string {
    return `${value.toFixed(2)}x`;
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  isIndividualAccount(): boolean {
    return this.accountContext.isIndividualAccount();
  }

  private formatDateOffset(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }
}
