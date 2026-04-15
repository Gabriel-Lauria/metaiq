import { Injectable, computed, inject, signal } from '@angular/core';
import { Store } from '../models';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class StoreContextService {
  private api = inject(ApiService);
  private readonly storageKey = 'selectedStoreId';

  stores = signal<Store[]>([]);
  selectedStoreId = signal(this.getStoredStoreId());
  loading = signal(false);
  error = signal<string | null>(null);
  selectedStore = computed(() =>
    this.stores().find((store) => store.id === this.selectedStoreId()) ?? null
  );

  load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.getAccessibleStores().subscribe({
      next: (stores) => {
        this.stores.set(stores);
        if (!this.selectedStoreId() && stores.length === 1) {
          this.select(stores[0].id);
        }
        if (this.selectedStoreId() && !stores.some((store) => store.id === this.selectedStoreId())) {
          this.select(stores[0]?.id ?? '');
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message || 'Não foi possível carregar stores.');
        this.stores.set([]);
        this.selectedStoreId.set('');
        this.loading.set(false);
      },
    });
  }

  select(storeId: string): void {
    this.selectedStoreId.set(storeId);
    try {
      if (storeId) {
        localStorage.setItem(this.storageKey, storeId);
      } else {
        localStorage.removeItem(this.storageKey);
      }
    } catch {
      // Storage is optional; context still works in memory.
    }
  }

  private getStoredStoreId(): string {
    try {
      return localStorage.getItem(this.storageKey) ?? '';
    } catch {
      return '';
    }
  }
}
