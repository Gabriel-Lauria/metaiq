import { CommonModule } from '@angular/common';
import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { StoreContextService } from '../../core/services/store-context.service';
import { AggregatedMetrics } from '../../core/models';
import { UiKpiCardComponent } from '../../core/components/ui-kpi-card.component';
import { UiStateComponent } from '../../core/components/ui-state.component';

@Component({
  selector: 'app-metrics',
  standalone: true,
  imports: [CommonModule, FormsModule, UiKpiCardComponent, UiStateComponent],
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

  constructor() {
    effect(() => {
      if (!this.storeContext.loaded() || !this.storeContext.getValidSelectedStoreId()) return;
      queueMicrotask(() => this.load());
    });
  }

  ngOnInit(): void {
    this.storeContext.load();
    if (this.storeContext.loaded() && this.storeContext.getValidSelectedStoreId()) {
      this.load();
    }
  }

  load(): void {
    const storeId = this.storeContext.getValidSelectedStoreId();
    if (!storeId) {
      this.loading.set(false);
      this.error.set('Selecione uma store para visualizar as métricas.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.api.getMetricsSummaryForStore(this.period(), storeId).subscribe({
      next: (metrics) => {
        this.metrics.set(metrics);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message || 'Não foi possível carregar as métricas.');
        this.loading.set(false);
      },
    });
  }

  setStore(storeId: string): void {
    this.storeContext.select(storeId);
  }

  setPeriod(days: number): void {
    this.period.set(days);
    this.load();
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
}
