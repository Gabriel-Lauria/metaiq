import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/services/api.service';
import { AccountContextService } from '../../core/services/account-context.service';
import { AuthService } from '../../core/services/auth.service';
import { UiService } from '../../core/services/ui.service';
import {
  IntegrationStatus,
  MetaAdAccount,
  MetaPage,
  Store,
  StoreIntegration,
  SyncStatus,
  Role,
} from '../../core/models';
import { UiBadgeComponent } from '../../core/components/ui-badge.component';
import { UiStateComponent } from '../../core/components/ui-state.component';

@Component({
  selector: 'app-integrations',
  standalone: true,
  imports: [CommonModule, FormsModule, UiBadgeComponent, UiStateComponent],
  templateUrl: './integrations.component.html',
  styleUrls: ['./integrations.component.scss'],
})
export class IntegrationsComponent implements OnInit {
  private api = inject(ApiService);
  private authService = inject(AuthService);
  readonly accountContext = inject(AccountContextService);
  private ui = inject(UiService);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  stores = signal<Store[]>([]);
  integrations = signal<Record<string, StoreIntegration>>({});
  selectedStoreId = signal('');
  loading = signal(false);
  loadingAccounts = signal(false);
  loadingPages = signal(false);
  savingPage = signal(false);
  savingStoreId = signal<string | null>(null);
  error = signal<string | null>(null);
  adAccounts = signal<MetaAdAccount[]>([]);
  pages = signal<MetaPage[]>([]);
  pageForm = {
    pageId: '',
  };

  selectedIntegration = computed(() => {
    const storeId = this.selectedStoreId();
    return storeId ? this.integrations()[storeId] ?? null : null;
  });
  selectedStore = computed(() =>
    this.stores().find((store) => store.id === this.selectedStoreId()) ?? null,
  );

  ngOnInit(): void {
    this.handleOAuthResult();
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);

    const currentRole = this.authService.getCurrentRole();
    const storeRequest = currentRole && [Role.PLATFORM_ADMIN, Role.ADMIN].includes(currentRole)
      ? this.api.getStores()
      : this.api.getAccessibleStores();

    storeRequest
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (stores) => {
          this.stores.set(stores);
          if (this.selectedStoreId() && !this.canUseStore(this.selectedStoreId())) {
            this.selectedStoreId.set('');
            this.ui.showWarning('Loja inválida', 'A loja anterior não pertence ao usuário atual.');
          }
          if (!this.selectedStoreId() && stores.length) {
            this.selectedStoreId.set(stores[0].id);
          }
          this.loadStatuses(stores);
        },
        error: (err) => {
          this.error.set(err.message);
          this.loading.set(false);
        },
      });
  }

  selectStore(storeId: string): void {
    if (!this.canUseStore(storeId)) {
      this.selectedStoreId.set('');
      this.ui.showWarning('Loja inválida', 'Selecione uma loja disponível para o usuário atual.');
      return;
    }
    this.selectedStoreId.set(storeId);
    this.adAccounts.set([]);
    this.pages.set([]);
    this.pageForm.pageId = '';
    if (this.integrations()[storeId]?.status === IntegrationStatus.CONNECTED) {
      this.loadPagesIfNeeded(storeId);
    }
  }

  connect(store: Store): void {
    if (!this.canManageIntegrations()) return;
    this.savingStoreId.set(store.id);
    this.api.startMetaOAuth(store.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ authorizationUrl }) => {
          this.savingStoreId.set(null);
          window.location.href = authorizationUrl;
        },
        error: (err) => {
          this.error.set(err.message);
          this.savingStoreId.set(null);
          this.ui.showError('Não foi possível iniciar OAuth', err.message);
        },
      });
  }

  disconnect(store: Store): void {
    if (!this.canManageIntegrations()) return;
    this.savingStoreId.set(store.id);
    this.api.disconnectMetaIntegration(store.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (integration) => {
          this.mergeIntegration(integration);
          this.savingStoreId.set(null);
          this.ui.showInfo('Integração desconectada', `${store.name} não está mais conectada à Meta.`);
        },
        error: (err) => {
          this.error.set(err.message);
          this.savingStoreId.set(null);
          this.ui.showError('Não foi possível desconectar', err.message);
        },
      });
  }

  fetchAdAccounts(store: Store): void {
    if (!this.canManageIntegrations()) return;
    this.loadingAccounts.set(true);
    this.api.getMetaAdAccounts(store.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (accounts) => {
          this.adAccounts.set(accounts);
          this.loadingAccounts.set(false);
          this.ui.showInfo('Contas carregadas', `${accounts.length} conta(s) encontrada(s) na Meta.`);
        },
        error: (err) => {
          this.error.set(err.message);
          this.loadingAccounts.set(false);
          this.ui.showError('Não foi possível buscar contas', err.message);
          this.load();
        },
      });
  }

  syncAdAccounts(store: Store): void {
    if (!this.canManageIntegrations()) return;
    this.loadingAccounts.set(true);
    this.mergeIntegration({
      ...(this.selectedIntegration() as StoreIntegration),
      lastSyncStatus: SyncStatus.IN_PROGRESS,
      lastSyncError: null,
    });
    this.api.syncMetaAdAccounts(store.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (accounts) => {
          this.adAccounts.set(accounts);
          this.loadingAccounts.set(false);
          this.ui.showSuccess('Contas sincronizadas', `${accounts.length} conta(s) atualizada(s) no MetaIQ.`);
          this.load();
        },
        error: (err) => {
          this.error.set(err.message);
          this.loadingAccounts.set(false);
          this.ui.showError('Não foi possível sincronizar contas', err.message);
          this.load();
        },
      });
  }

  statusLabel(status?: IntegrationStatus): string {
    const labels: Record<IntegrationStatus, string> = {
      [IntegrationStatus.NOT_CONNECTED]: 'Não conectado',
      [IntegrationStatus.CONNECTING]: 'Conectando',
      [IntegrationStatus.CONNECTED]: 'Conectado',
      [IntegrationStatus.EXPIRED]: 'Token expirado',
      [IntegrationStatus.ERROR]: 'Erro',
    };
    return status ? labels[status] : 'Não conectado';
  }

  statusTone(status?: IntegrationStatus): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
    if (status === IntegrationStatus.CONNECTED) return 'success';
    if (status === IntegrationStatus.ERROR || status === IntegrationStatus.EXPIRED) return 'danger';
    if (status === IntegrationStatus.CONNECTING) return 'info';
    return 'neutral';
  }

  canManageIntegrations(): boolean {
    return this.authService.hasAnyRole([Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL]);
  }

  isIndividualAccount(): boolean {
    return this.accountContext.isIndividualAccount();
  }

  isClient(): boolean {
    return this.authService.getCurrentRole() === Role.CLIENT;
  }

  isConnected(): boolean {
    return this.selectedIntegration()?.status === IntegrationStatus.CONNECTED;
  }

  hasConfiguredPage(): boolean {
    return !!this.selectedIntegration()?.pageId;
  }

  selectedPageName(): string {
    const integration = this.selectedIntegration();
    return integration?.pageName || integration?.pageId || '';
  }

  integrationSummaryMessage(): string {
    const integration = this.selectedIntegration();
    if (this.isClient()) {
      return 'Dados conectados automaticamente.';
    }

    if (this.isIndividualAccount() && (!integration || integration.status === IntegrationStatus.NOT_CONNECTED)) {
      return 'Conecte sua conta Meta para escolher página, sincronizar conta de anúncio e começar a criar campanhas.';
    }

    if (!integration || integration.status === IntegrationStatus.NOT_CONNECTED) {
      return 'A loja ainda não está conectada à Meta Ads. Conecte para começar a sincronizar campanhas e contas.';
    }

    if (integration.status === IntegrationStatus.CONNECTED) {
      return 'A integração está ativa. Sincronize as contas para manter os dados atualizados.';
    }

    if (integration.status === IntegrationStatus.EXPIRED) {
      return 'A conexão expirou. Refaça a conexão para continuar sincronizando.';
    }

    if (integration.status === IntegrationStatus.ERROR) {
      return 'Houve um problema na integração. Você pode reconectar ou verificar os detalhes abaixo.';
    }

    if (integration.status === IntegrationStatus.CONNECTING) {
      return 'A integração está sendo estabelecida. Aguarde a conclusão para continuar.';
    }

    return 'Confira o status e as ações disponíveis para esta integração.';
  }

  syncStatusLabel(status?: SyncStatus): string {
    const labels: Record<SyncStatus, string> = {
      [SyncStatus.NEVER_SYNCED]: 'Nunca sincronizado',
      [SyncStatus.IN_PROGRESS]: 'Sincronizando',
      [SyncStatus.SUCCESS]: 'Sincronizado',
      [SyncStatus.ERROR]: 'Erro',
    };
    return status ? labels[status] : labels[SyncStatus.NEVER_SYNCED];
  }

  syncStatusTone(status?: SyncStatus): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
    if (status === SyncStatus.SUCCESS) return 'success';
    if (status === SyncStatus.IN_PROGRESS) return 'info';
    if (status === SyncStatus.ERROR) return 'danger';
    return 'neutral';
  }

  isSyncInProgress(): boolean {
    return this.loadingAccounts() || this.selectedIntegration()?.lastSyncStatus === SyncStatus.IN_PROGRESS;
  }

  getStoreIntegration(storeId: string): StoreIntegration | null {
    return this.integrations()[storeId] ?? null;
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  trackByExternalId(_: number, item: { externalId: string }): string {
    return item.externalId;
  }

  savePage(store: Store): void {
    if (!this.canManageIntegrations()) return;
    const page = this.pages().find((item) => item.id === this.pageForm.pageId);
    if (!page) {
      this.ui.showError('Página obrigatória', 'Selecione uma página disponível para a integração.');
      return;
    }

    this.savingPage.set(true);
    this.api.updateMetaPage(store.id, { pageId: page.id, pageName: page.name })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (integration) => {
          this.mergeIntegration(integration);
          this.savingPage.set(false);
          this.ui.showSuccess('Página vinculada', `${page.name} será usada na criação de campanhas.`);
        },
        error: (err) => {
          this.savingPage.set(false);
          this.ui.showError('Não foi possível salvar página', err.message);
        },
      });
  }

  refreshPages(store: Store): void {
    if (!this.canManageIntegrations()) return;
    this.loadPagesIfNeeded(store.id, true);
  }

  goToCampaigns(store: Store): void {
    if (!this.canManageIntegrations()) return;
    this.router.navigate(['/campaigns'], {
      queryParams: {
        openCreate: 1,
        storeId: store.id,
      },
    });
  }

  private loadPagesIfNeeded(storeId: string, force = false): void {
    const integration = this.integrations()[storeId];
    if (!integration || integration.status !== IntegrationStatus.CONNECTED) return;
    if (!force && integration.pageId) {
      this.pageForm.pageId = integration.pageId;
      return;
    }
    if (!force && this.pages().length) return;

    this.loadingPages.set(true);
    this.api.getMetaPages(storeId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (pages) => {
          this.pages.set(pages);
          this.pageForm.pageId = integration.pageId || pages[0]?.id || '';
          this.loadingPages.set(false);
        },
        error: (err) => {
          this.loadingPages.set(false);
          this.ui.showError('Não foi possível carregar páginas', err.message);
        },
      });
  }

  private loadStatuses(stores: Store[]): void {
    if (!stores.length) {
      this.integrations.set({});
      this.loading.set(false);
      return;
    }

    const requests = stores.map((store) =>
      this.api.getMetaIntegrationStatus(store.id).pipe(catchError(() => of(null))),
    );

    forkJoin(requests)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((statuses) => {
        const next: Record<string, StoreIntegration> = {};
        statuses.forEach((integration) => {
          if (integration) {
            next[integration.storeId] = integration;
          }
        });
        this.integrations.set(next);
        const selected = this.selectedStoreId();
        if (selected) {
          this.selectStore(selected);
        }
        this.loading.set(false);
      });
  }

  private mergeIntegration(integration: StoreIntegration): void {
    this.integrations.update((current) => ({
      ...current,
      [integration.storeId]: integration,
    }));
  }

  private handleOAuthResult(): void {
    const params = this.route.snapshot.queryParamMap;
    const result = params.get('metaOAuth');
    const message = params.get('message');
    const storeId = params.get('storeId');

    if (storeId) {
      this.selectedStoreId.set(storeId);
    }

    if (result === 'success') {
      this.ui.showSuccess('Meta conectada', message || (this.isIndividualAccount() ? 'Sua conta Meta foi conectada com sucesso.' : 'A loja foi conectada com sucesso.'));
      this.clearOAuthQueryParams();
    }

    if (result === 'error') {
      this.ui.showError('Falha ao conectar Meta', message || 'Não foi possível concluir a conexão.');
      this.clearOAuthQueryParams();
    }
  }

  private canUseStore(storeId: string): boolean {
    if (!storeId) return true;
    const stores = this.stores();
    return stores.length === 0 || stores.some((store) => store.id === storeId);
  }

  private clearOAuthQueryParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { metaOAuth: null, message: null, storeId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
