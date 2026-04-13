import {
  Component, OnInit, OnDestroy, inject, signal, DestroyRef,
  ElementRef, ViewChild, afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/services/api.service';
import { AggregatedMetrics, CampaignInsightReport } from '../../core/models';
import { Chart, registerables } from 'chart.js';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { FormatUtils } from '../../core/utils/format.utils';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private uiService = inject(UiService);
  private destroyRef = inject(DestroyRef);

  @ViewChild('spendCanvas') spendCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('roasCanvas')  roasCanvas!:  ElementRef<HTMLCanvasElement>;

  metrics  = signal<AggregatedMetrics | null>(null);
  insights = signal<CampaignInsightReport[]>([]);
  loading  = signal(true);
  error    = signal<string | null>(null);
  success  = signal<string | null>(null);
  period   = signal(30);

  private spendChart?: Chart;
  private roasChart?: Chart;

  // Expor utilitários para template
  readonly fmt = FormatUtils.currency;
  readonly fmtPct = FormatUtils.percent;

  constructor() {
    afterNextRender(() => {
      this.tryBuildCharts();
    });
  }

  ngOnInit() {
    this.loadData();
  }

  ngOnDestroy() {
    this.destroyCharts();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set(null);
    const days = this.period();

    forkJoin({
      metrics: this.api.getMetricsSummary(days).pipe(
        catchError(err => {
          console.warn('Erro ao carregar métricas:', err);
          return of(null);
        })
      ),
      insights: this.api.getInsights(days).pipe(
        catchError(err => {
          console.warn('Erro ao carregar insights:', err);
          return of([]);
        })
      ),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ metrics, insights }) => {
          this.metrics.set(metrics);
          this.insights.set(insights as CampaignInsightReport[]);
          this.loading.set(false);
          this.tryBuildCharts();
        },
        error: (err) => {
          console.error('Erro ao carregar dados do dashboard:', err);
          this.error.set(err.message || 'Erro ao carregar dados do dashboard');
          this.loading.set(false);
          this.uiService.showError('Erro', this.error()!);
        },
      });
  }

  setPeriod(days: number): void {
    this.period.set(days);
    this.destroyCharts();
    this.loadData();
  }

  get allInsights(): any[] {
    return this.insights().flatMap(r => r.insights).slice(0, 8);
  }

  private tryBuildCharts(): void {
    if (!this.spendCanvas?.nativeElement || !this.roasCanvas?.nativeElement) {
      console.warn('Canvas elements not found yet');
      return;
    }
    this.buildCharts();
  }

  private buildCharts(): void {
    this.destroyCharts();

    // Só construir gráficos se houver dados
    if (!this.metrics()) {
      return;
    }

    // ── Gráfico ROAS por Campanha ─────────────────────────────
    if (this.roasCanvas?.nativeElement) {
      const rows = this.insights().slice(0, 6);
      if (rows.length > 0) {
        const campLabels = rows.map(r => r.campaignName.split(' ')[0].substring(0, 10));
        const roasData = rows.map(r => parseFloat((r.score / 20).toFixed(2)));
        const barColors = roasData.map(v =>
          v >= 3 ? 'rgba(52,211,153,0.75)' : v > 0 ? 'rgba(251,191,36,0.75)' : 'rgba(74,85,104,0.4)'
        );

        this.roasChart = new Chart(this.roasCanvas.nativeElement, {
          type: 'bar',
          data: {
            labels: campLabels,
            datasets: [
              {
                label: 'ROAS',
                data: roasData,
                backgroundColor: barColors,
                borderRadius: 4,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: '#4a5568', font: { size: 10 } }, grid: { display: false } },
              y: {
                ticks: { color: '#4a5568', font: { size: 10 }, callback: (v) => `${v}×` },
                grid: { color: '#1c2438' },
              },
            },
          },
        });
      }
    }
  }

  private destroyCharts(): void {
    this.spendChart?.destroy();
    this.roasChart?.destroy();
    this.spendChart = undefined;
    this.roasChart = undefined;
  }
}
}
