import { CommonModule } from '@angular/common';
import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { StoreContextService } from '../../core/services/store-context.service';
import { DashboardSummary } from '../../core/models';
import { UiKpiCardComponent } from '../../core/components/ui-kpi-card.component';
import { UiStateComponent } from '../../core/components/ui-state.component';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule, FormsModule, UiKpiCardComponent, UiStateComponent],
  templateUrl: './results.component.html',
  styleUrls: ['./results.component.scss'],
})
export class ResultsComponent implements OnInit {
  private api = inject(ApiService);
  storeContext = inject(StoreContextService);

  loading = signal(true);
  error = signal<string | null>(null);
  period = signal(30);
  summary = signal<DashboardSummary | null>(null);

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
      this.error.set('Selecione uma loja para visualizar os resultados.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.api.getDashboardSummary(this.period(), storeId).subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message || 'Não foi possível carregar os resultados.');
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
