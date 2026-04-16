import { Injectable, computed, inject, signal } from '@angular/core';
import { Role, Store } from '../models';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class StoreContextService {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private readonly storageKey = 'selectedStoreId';

  stores = signal<Store[]>([]);
  selectedStoreId = signal(this.getStoredStoreId());
  loading = signal(false);
  loaded = signal(false);
  error = signal<string | null>(null);
  selectedStore = computed(() =>
    this.stores().find((store) => store.id === this.selectedStoreId()) ?? null
  );

  load(force = false): void {
    if (!force && (this.loading() || this.stores().length > 0)) {
      this.loaded.set(true);
      return;
    }

    this.loading.set(true);
    this.loaded.set(false);
    this.error.set(null);

    this.api.getAccessibleStores().subscribe({
      next: (stores) => {
        this.stores.set(stores);
        const mustHaveStore = this.requiresStoreContext();
        if (!this.selectedStoreId() && (stores.length === 1 || mustHaveStore)) {
          this.select(stores[0].id);
        }
        if (this.selectedStoreId() && !stores.some((store) => store.id === this.selectedStoreId())) {
          this.select(stores[0]?.id ?? '');
        }
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: (err) => {
        this.error.set(err.message || 'Não foi possível carregar stores.');
        this.stores.set([]);
        this.selectedStoreId.set('');
        this.loading.set(false);
        this.loaded.set(true);
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

  private requiresStoreContext(): boolean {
    const role = this.auth.getCurrentRole();
    return role === Role.OPERATIONAL || role === Role.CLIENT;
  }
}
