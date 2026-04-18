import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
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
  private currentUserId = this.auth.getCurrentUser()?.id ?? null;

  constructor() {
    this.auth.currentUser$.subscribe((user) => {
      const nextUserId = user?.id ?? null;
      if (this.currentUserId !== nextUserId) {
        this.currentUserId = nextUserId;
        this.reset();
      }
    });
  }

  load(force = false): void {
    if (!force && (this.loading() || this.stores().length > 0)) {
      this.loaded.set(true);
      return;
    }

    const request = this.useAccessibleStores()
      ? this.api.getAccessibleStores()
      : this.api.getStores();

    this.loadStores(request);
  }

  loadAccessibleStores(force = false): void {
    if (!force && (this.loading() || this.stores().length > 0)) {
      this.loaded.set(true);
      return;
    }

    this.loadStores(this.api.getAccessibleStores());
  }

  private loadStores(request: Observable<Store[]>): void {
    this.loading.set(true);
    this.loaded.set(false);
    this.error.set(null);

    request.subscribe({
      next: (stores) => {
        this.stores.set(stores);
        this.ensureValidSelection(stores);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: (err) => {
        this.reset();
        this.error.set(err.message || 'Não foi possível carregar lojas.');
        this.loading.set(false);
        this.loaded.set(true);
      },
    });
  }

  select(storeId: string): void {
    const safeStoreId = this.canUseStore(storeId) ? storeId : '';
    this.selectedStoreId.set(safeStoreId);
    try {
      if (safeStoreId) {
        localStorage.setItem(this.storageKey, safeStoreId);
      } else {
        localStorage.removeItem(this.storageKey);
      }
    } catch {
      // Storage is optional; context still works in memory.
    }
  }

  reset(): void {
    this.stores.set([]);
    this.selectedStoreId.set('');
    this.loaded.set(false);
    this.loading.set(false);
    this.error.set(null);
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // Storage is optional; context still works in memory.
    }
  }

  hasAccessToStore(storeId: string | null | undefined): boolean {
    return !!storeId && this.stores().some((store) => store.id === storeId);
  }

  getValidSelectedStoreId(): string {
    const storeId = this.selectedStoreId();
    return this.hasAccessToStore(storeId) ? storeId : '';
  }

  private ensureValidSelection(stores: Store[]): void {
    const currentStoreId = this.selectedStoreId();
    const hasCurrentStore = !!currentStoreId && stores.some((store) => store.id === currentStoreId);

    if (hasCurrentStore) {
      this.select(currentStoreId);
      return;
    }

    const mustHaveStore = this.requiresStoreContext();
    const fallbackStoreId = stores.length === 1 || mustHaveStore ? stores[0]?.id ?? '' : '';
    this.select(fallbackStoreId);
  }

  private canUseStore(storeId: string): boolean {
    if (!storeId) return true;
    if (!this.loaded() && this.stores().length === 0) return true;
    return this.stores().some((store) => store.id === storeId);
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

  private useAccessibleStores(): boolean {
    const role = this.auth.getCurrentRole();
    return role === Role.OPERATIONAL || role === Role.CLIENT;
  }
}
