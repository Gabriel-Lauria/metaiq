import { CommonModule } from '@angular/common';
import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { StoreContextService } from '../../core/services/store-context.service';
import { Insight } from '../../core/models';
import { UiStateComponent } from '../../core/components/ui-state.component';

@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [CommonModule, FormsModule, UiStateComponent],
  templateUrl: './insights.component.html',
  styleUrls: ['./insights.component.scss'],
})
export class InsightsComponent implements OnInit {
  private api = inject(ApiService);
  storeContext = inject(StoreContextService);

  loading = signal(true);
  error = signal<string | null>(null);
  period = signal(30);
  insights = signal<Insight[]>([]);

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
      this.error.set('Selecione uma loja para visualizar os insights.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.api.getInsightsForStore(this.period(), storeId).subscribe({
      next: (insights) => {
        this.insights.set(insights);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message || 'Não foi possível carregar os insights.');
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

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }
}
