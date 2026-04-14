import { Component, OnInit, inject, signal, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { UiService } from '../../core/services/ui.service';
import { AggregatedMetrics, Insight, CampaignInsightReport } from '../../core/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);
  private uiService = inject(UiService);
  private destroyRef = inject(DestroyRef);

  loading = signal(true);
  error = signal<string | null>(null);
  period = signal(30);
  metrics = signal<AggregatedMetrics | null>(null);
  insights = signal<Insight[]>([]);
  lastUpdated = signal<Date | null>(null);

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      metrics: this.api.getMetricsSummary(this.period()).pipe(
        catchError((err) => {
          console.error('Erro ao carregar métricas:', err);
          return of(null);
        })
      ),
      reports: this.api.getInsights(this.period()).pipe(
        catchError((err) => {
          console.error('Erro ao carregar insights:', err);
          return of([] as CampaignInsightReport[]);
        })
      ),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ metrics, reports }) => {
          this.metrics.set(metrics);
          this.insights.set(this.transformInsights(reports || []));
          this.lastUpdated.set(new Date());
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Erro ao carregar dashboard:', err);
          this.error.set(err?.message || 'Não foi possível carregar os dados. Tente novamente.');
          this.loading.set(false);
          this.uiService.showError('Erro ao carregar dados', err?.message || 'Não foi possível carregar os dados do dashboard.');
        },
      });
  }

  setPeriod(days: number): void {
    this.period.set(days);
    this.loadData();
  }

  fmt(value: number): string {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  fmtPct(value: number): string {
    return `${(value * 100).toFixed(2)}%`;
  }

  get allInsights(): Insight[] {
    return this.insights();
  }

  getLastUpdatedLabel(): string {
    return this.lastUpdated() ? new Date(this.lastUpdated()!).toLocaleTimeString('pt-BR') : 'agora';
  }

  private transformInsights(reports: CampaignInsightReport[]): Insight[] {
    return reports.flatMap((report) => report.insights || []);
  }
}
