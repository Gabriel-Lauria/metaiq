import { Component, OnInit, inject, signal, computed, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, switchMap, debounceTime, tap } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { UiService } from '../../core/services/ui.service';
import { AggregatedMetrics, Insight } from '../../core/models';

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
  private periodSubject = new Subject<number>();

  loading = signal(true);
  error = signal<string | null>(null);
  period = signal(30);
  metrics = signal<AggregatedMetrics | null>(null);
  insights = signal<Insight[]>([]);
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

  ngOnInit(): void {
    // Usar switchMap para cancelar requisições anteriores ao trocar o período
    this.periodSubject
      .pipe(
        debounceTime(100),
        tap(() => this.loading.set(true)),
        switchMap((days) =>
          forkJoin({
            metrics: this.api.getMetricsSummary(days).pipe(
              catchError((err) => {
                console.error('Erro ao carregar métricas:', err);
                return of(null);
              })
            ),
            insights: this.api.getInsights(days).pipe(
              catchError((err) => {
                console.error('Erro ao carregar insights:', err);
                return of([] as Insight[]);
              })
            ),
          })
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ metrics, insights }) => {
          this.metrics.set(metrics);
          this.insights.set(insights || []);
          this.lastUpdated.set(new Date());
          this.loading.set(false);
          this.error.set(null);
        },
        error: (err) => {
          console.error('Erro ao carregar dashboard:', err);
          this.error.set(err?.message || 'Não foi possível carregar os dados. Tente novamente.');
          this.loading.set(false);
          this.uiService.showError('Erro ao carregar dados', err?.message || 'Não foi possível carregar os dados do dashboard.');
        },
      });

    this.loadData();
  }

  loadData(): void {
    this.periodSubject.next(this.period());
  }

  setPeriod(days: number): void {
    this.period.set(days);
    this.periodSubject.next(days);
  }

  fmt(value: number): string {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  fmtPct(value: number): string {
    return `${(value * 100).toFixed(2)}%`;
  }

  fmtRoas(value: number): string {
    return `${value.toFixed(2)}x`;
  }

  get allInsights(): Insight[] {
    return this.insights();
  }

  getLastUpdatedLabel(): string {
    return this.lastUpdated() ? new Date(this.lastUpdated()!).toLocaleTimeString('pt-BR') : 'agora';
  }
}
