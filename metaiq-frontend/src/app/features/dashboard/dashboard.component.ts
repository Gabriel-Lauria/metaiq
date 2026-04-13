import { Component, OnInit, OnDestroy, inject, signal, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService, PaginatedResponse } from '../../core/services/api.service';
import { UiService } from '../../core/services/ui.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MetricCardComponent } from './components/metric-card.component';
import { CampaignTableComponent } from './components/campaign-table.component';
import { DashboardChartComponent } from './components/dashboard-chart.component';
import { LoadingStateComponent } from './components/loading-state.component';
import { ErrorStateComponent } from './components/error-state.component';
import { Campaign, MetricDaily, AggregatedMetrics } from '../../core/models';

interface MetricCardData {
  label: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  unit?: string;
  icon?: string;
}

interface CampaignData {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  spend?: number;
  budget?: number;
  conversions?: number;
  roas?: number;
  cpa?: number;
  ctr?: number;
  score?: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MetricCardComponent,
    CampaignTableComponent,
    DashboardChartComponent,
    LoadingStateComponent,
    ErrorStateComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private uiService = inject(UiService);
  private destroyRef = inject(DestroyRef);

  loading = signal(true);
  error = signal<string | null>(null);
  timeRange = signal('30d');

  // Pagination
  campaignsPage = signal(1);
  campaignsLimit = signal(10);
  campaignsTotal = signal(0);
  campaignsTotalPages = signal(0);

  metrics = signal<AggregatedMetrics | null>(null);
  metricsCards = signal<MetricCardData[]>([]);
  campaigns = signal<CampaignData[]>([]);
  chartData = signal<any>(null);
  
  lastUpdated = new Date();

  constructor(
    private apiService: ApiService,
    private destroyRef: DestroyRef
  ) {}

  ngOnInit(): void {
    this.loadDashboardData();
  }

  ngOnDestroy(): void {
    // Cleanup handled by takeUntilDestroyed
  }

  changeTimeRange(range: string): void {
    this.timeRange.set(range);
    this.loadDashboardData();
  }

  retry(): void {
    this.error.set(null);
    this.loadDashboardData();
  }

  nextPage(): void {
    if (this.campaignsPage() < this.campaignsTotalPages()) {
      this.campaignsPage.set(this.campaignsPage() + 1);
      this.loadDashboardData();
    }
  }

  prevPage(): void {
    if (this.campaignsPage() > 1) {
      this.campaignsPage.set(this.campaignsPage() - 1);
      this.loadDashboardData();
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.campaignsTotalPages()) {
      this.campaignsPage.set(page);
      this.loadDashboardData();
    }
  }

  private loadDashboardData(): void {
    this.loading.set(true);
    this.error.set(null);

    const days = this.getDaysFromRange(this.timeRange());

    forkJoin({
      metrics: this.api.getMetricsSummary(days).pipe(
        catchError(err => {
          console.error('Erro ao carregar métricas:', err);
          return of(null);
        })
      ),
      campaigns: this.api.getCampaigns({
        page: this.campaignsPage(),
        limit: this.campaignsLimit()
      }).pipe(
        catchError(err => {
          console.error('Erro ao carregar campanhas:', err);
          return of({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0, hasNext: false, hasPrev: false } });
        })
      )
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ metrics, campaigns }) => {
          if (metrics) {
            this.metrics.set(metrics);
            this.buildMetricsCards(metrics);
          }

          if (campaigns && campaigns.data) {
            this.campaigns.set(this.transformCampaigns(campaigns.data));
            this.campaignsTotal.set(campaigns.meta.total);
            this.campaignsTotalPages.set(campaigns.meta.totalPages);
            this.buildChartData(campaigns.data, metrics);
          } else {
            this.campaigns.set([]);
            this.campaignsTotal.set(0);
            this.campaignsTotalPages.set(0);
          }

          this.loading.set(false);
          this.lastUpdated = new Date();
        },
        error: (err) => {
          console.error('Erro ao carregar dashboard:', err);
          this.error.set(err?.message || 'Não foi possível carregar os dados. Tente novamente.');
          this.loading.set(false);
          this.uiService.showError('Erro ao carregar dados', err?.message || 'Não foi possível carregar os dados do dashboard.');
        }
      });
  }

  private getDaysFromRange(range: string): number {
    const rangeMap: { [key: string]: number } = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      'today': 1
    };
    return rangeMap[range] || 30;
  }

  private buildMetricsCards(metrics: AggregatedMetrics): void {
    const cards: MetricCardData[] = [
      {
        label: 'Gasto Total',
        value: this.formatCurrency(metrics.totalSpend || metrics.spend || 0),
        change: '+12.4% vs período anterior',
        trend: 'up',
        icon: '💰',
        bgColor: 'linear-gradient(135deg, #0f1320 0%, #1a1f2e 100%)'
      },
      {
        label: 'ROAS',
        value: (metrics.avgRoas || metrics.roas || 0).toFixed(2),
        unit: '×',
        change: (metrics.roas || 0) > 3 ? 'Excelente' : (metrics.roas || 0) > 2 ? 'Bom' : 'Atenção',
        trend: (metrics.roas || 0) > 2 ? 'up' : (metrics.roas || 0) > 1 ? 'neutral' : 'down',
        icon: '📈',
        bgColor: (metrics.roas || 0) > 3 ? 'linear-gradient(135deg, #0f5132 0%, #198754 100%)' : 
                 (metrics.roas || 0) > 2 ? 'linear-gradient(135deg, #0f1320 0%, #1a1f2e 100%)' : 
                 'linear-gradient(135deg, #58151c 0%, #dc3545 100%)'
      },
      {
        label: 'CPA',
        value: this.formatCurrency(metrics.avgCpa || metrics.cpa || 0),
        change: (metrics.cpa || 0) < 50 ? 'Dentro do orçamento' : 'Revisar estratégia',
        trend: (metrics.cpa || 0) < 50 ? 'up' : 'down',
        icon: '🎯',
        bgColor: (metrics.cpa || 0) < 50 ? 'linear-gradient(135deg, #0f5132 0%, #198754 100%)' : 
                 'linear-gradient(135deg, #58151c 0%, #dc3545 100%)'
      },
      {
        label: 'CTR',
        value: ((metrics.avgCtr || metrics.ctr || 0) * 100).toFixed(2),
        unit: '%',
        change: (metrics.ctr || 0) > 0.02 ? 'Ótimo engajamento' : 'Pode melhorar',
        trend: (metrics.ctr || 0) > 0.02 ? 'up' : 'down',
        icon: '📊',
        bgColor: (metrics.ctr || 0) > 0.02 ? 'linear-gradient(135deg, #0f5132 0%, #198754 100%)' : 
                 'linear-gradient(135deg, #0f1320 0%, #1a1f2e 100%)'
      }
    ];

    this.metricsCards.set(cards);
  }

  private buildChartData(campaigns: Campaign[], metrics: AggregatedMetrics | null): void {
    if (!campaigns || campaigns.length === 0) return;

    // Simular dados diários para o gráfico
    const days = 30;
    const labels: string[] = [];
    const spendData: number[] = [];
    const conversionData: number[] = [];

    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      labels.push((date.getDate()).toString().padStart(2, '0'));
      
      const dailySpend = (metrics?.totalSpend || 48000) / days + (Math.random() - 0.5) * 2000;
      const conversions = 20 + Math.random() * 30;
      
      spendData.push(Math.max(0, dailySpend));
      conversionData.push(conversions);
    }

    this.chartData.set({
      labels,
      datasets: [
        {
          label: 'Gasto (R$)',
          data: spendData,
          borderColor: '#6ee7f7',
          backgroundColor: 'rgba(110,231,247,0.06)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: 'y'
        },
        {
          label: 'Conversões',
          data: conversionData,
          borderColor: '#34d399',
          backgroundColor: 'rgba(52,211,153,0.06)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
          borderDash: [4, 3],
          yAxisID: 'y1'
        }
      ]
    });
  }

  private transformCampaigns(campaigns: Campaign[]): CampaignData[] {
    return campaigns.map(campaign => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status as 'ACTIVE' | 'PAUSED' | 'ARCHIVED',
      spend: Math.random() * 10000,
      budget: campaign.dailyBudget * 30,
      conversions: Math.floor(Math.random() * 100),
      roas: 2 + Math.random() * 4,
      cpa: 30 + Math.random() * 50,
      ctr: 1 + Math.random() * 4,
      score: 40 + Math.random() * 60
    }));
  }

  private formatCurrency(value: number): string {
    if (value >= 1000000) return 'R$' + (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return 'R$' + (value / 1000).toFixed(1) + 'K';
    return 'R$' + value.toFixed(0);
  }

  getTimeRangeLabel(range: string): string {
    const labels: { [key: string]: string } = {
      '7d': 'Últimos 7 dias',
      '30d': 'Últimos 30 dias',
      '90d': 'Últimos 90 dias',
      'today': 'Hoje'
    };
    return labels[range] || 'Últimos 30 dias';
  }
}
          x: {
            ticks: { color: '#4a5568', font: { size: 10 } },
            grid: { display: false }
          } as any,
          y: {
            ticks: {
              color: '#4a5568',
              font: { size: 10 },
              callback: (v: any) => v + '×'
            },
            grid: { color: '#131929' }
          } as any
        }
      }
    });
  }

  getScoreColor(score: number): string {
    if (score >= 80) return '#34d399';
    if (score >= 55) return '#fbbf24';
    return '#fc8181';
  }

  getInsightIcon(type: string): string {
    const icons: { [key: string]: string } = {
      success: '✓',
      warning: '~',
      danger: '!',
      info: 'i'
    };
    return icons[type] || '•';
  }

  private formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }

  changeTimeRange(range: string): void {
    this.timeRange = range;
    // Reload data for new time range
    this.loadDashboardData();
  }
}

