import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { UiService } from '../../core/services/ui.service';
import {
  IntegrationStatus,
  AdAccount,
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
  creatingCampaign = signal(false);
  savingPage = signal(false);
  savingStoreId = signal<string | null>(null);
  error = signal<string | null>(null);
  adAccounts = signal<MetaAdAccount[]>([]);
  pages = signal<MetaPage[]>([]);
  internalAdAccounts = signal<AdAccount[]>([]);
  campaignResult = signal<{ campaignId: string; adSetId: string; creativeId: string; adId: string } | null>(null);
  campaignForm = {
    name: '',
    objective: 'OUTCOME_TRAFFIC',
    dailyBudget: 10,
    country: 'BR',
    adAccountId: '',
    message: '',
    imageUrl: '',
  };
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

    const storeRequest = [Role.PLATFORM_ADMIN, Role.MANAGER].includes(this.authService.getCurrentRole())
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
    this.internalAdAccounts.set([]);
    this.campaignResult.set(null);
    this.campaignForm.adAccountId = '';
    this.pageForm.pageId = '';
    if (this.integrations()[storeId]?.status === IntegrationStatus.CONNECTED) {
      this.loadPagesIfNeeded(storeId);
      this.loadInternalAdAccounts(storeId);
    }
  }

  connect(store: Store): void {
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
          this.loadInternalAdAccounts(store.id);
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

  createCampaign(store: Store): void {
    if (!this.selectedIntegration()?.pageId) {
      this.ui.showError('Página Meta obrigatória', 'Selecione a página do Facebook antes de criar campanha.');
      this.loadPagesIfNeeded(store.id, true);
      return;
    }

    if (!this.campaignForm.name || !this.campaignForm.adAccountId || !this.campaignForm.message || !this.campaignForm.imageUrl) {
      this.ui.showError('Campos obrigatórios', 'Preencha nome, conta, mensagem e URL da imagem.');
      return;
    }

    this.creatingCampaign.set(true);
    this.campaignResult.set(null);
    this.api.createMetaCampaign(store.id, {
      ...this.campaignForm,
      country: this.campaignForm.country.trim().toUpperCase(),
      dailyBudget: Number(this.campaignForm.dailyBudget),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.campaignResult.set({
            campaignId: result.campaignId,
            adSetId: result.adSetId,
            creativeId: result.creativeId,
            adId: result.adId,
          });
          this.creatingCampaign.set(false);
          this.ui.showSuccess('Campanha criada', 'A campanha foi criada na Meta com status pausado.');
        },
        error: (err) => {
          const message = this.formatCampaignCreationError(err);
          this.error.set(message);
          this.creatingCampaign.set(false);
          this.ui.showError('Não foi possível criar campanha', message);
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
    return this.authService.hasAnyRole([Role.PLATFORM_ADMIN, Role.OPERATIONAL]);
  }

  isOperational(): boolean {
    return this.authService.getCurrentRole() === Role.OPERATIONAL;
  }

  isManager(): boolean {
    return this.authService.getCurrentRole() === Role.MANAGER;
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

  canCreateCampaign(): boolean {
    return this.hasConfiguredPage() && !!this.internalAdAccounts().length && !this.creatingCampaign();
  }

  selectedPageName(): string {
    const integration = this.selectedIntegration();
    return integration?.pageName || integration?.pageId || '';
  }

  integrationSummaryMessage(): string {
    const integration = this.selectedIntegration();
    if (this.isManager()) {
      return 'Operação realizada pelo time.';
    }

    if (this.isClient()) {
      return 'Dados conectados automaticamente.';
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
    this.loadPagesIfNeeded(store.id, true);
  }

  private loadInternalAdAccounts(storeId: string): void {
    this.api.getAdAccounts(storeId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (accounts) => {
          const metaAccounts = accounts.filter((account) => account.provider === 'META' && account.active !== false);
          this.internalAdAccounts.set(metaAccounts);
          if (!this.campaignForm.adAccountId && metaAccounts.length) {
            this.campaignForm.adAccountId = metaAccounts[0].id;
          }
        },
        error: (err) => {
          this.ui.showError('Não foi possível carregar contas internas', err.message);
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
      this.ui.showSuccess('Meta conectada', message || 'A loja foi conectada com sucesso.');
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

  private formatCampaignCreationError(err: any): string {
    const parts = [
      err?.message || err?.details?.message || 'Não foi possível criar campanha. Verifique os dados e tente novamente.',
    ];

    const step = err?.step || err?.details?.step;
    const executionId = err?.executionId || err?.details?.executionId;
    const error = err?.error || err?.details?.error;

    if (step) {
      parts.push(`Etapa: ${step}.`);
    }
    if (executionId) {
      parts.push(`Execução: ${executionId}.`);
    }
    if (error && error !== parts[0]) {
      parts.push(`Detalhe: ${error}.`);
    }

    return parts.join(' ');
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
