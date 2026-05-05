import { Component, DestroyRef, HostListener, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { UiBadgeComponent } from '../../core/components/ui-badge.component';
import { UiStateComponent } from '../../core/components/ui-state.component';
import { AdAccount, IntegrationStatus, Role, Store, StoreIntegration } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { AccountContextService } from '../../core/services/account-context.service';
import { AuthService } from '../../core/services/auth.service';
import { StoreContextService } from '../../core/services/store-context.service';
import { UiService } from '../../core/services/ui.service';
import { CampaignCreatePanelComponent, CampaignCreateSuccessEvent } from './campaign-create-panel.component';
import { environment } from '../../core/environment';

interface CampaignMetric {
  ctr: number;
  cpc?: number;
  cpa: number;
  roas: number;
  score: number;
  spend: number;
  conversions: number;
  impressions: number;
  clicks: number;
  revenue?: number;
}

interface CampaignInsight {
  type: string;
  title?: string;
  message?: string;
  recommendation?: string;
}

interface Campaign {
  id: string;
  metaId?: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  objective?: 'CONVERSIONS' | 'REACH' | 'TRAFFIC' | 'LEADS' | null;
  dailyBudget?: number | null;
  storeId?: string | null;
  store?: Store | null;
  metrics?: CampaignMetric;
  insights?: CampaignInsight[];
}

interface CampaignCreationNotice {
  name: string;
  storeName: string;
  response: CampaignCreateSuccessEvent['response'];
}

interface CampaignStatusAction {
  campaign: Campaign;
  nextStatus: 'ACTIVE' | 'PAUSED';
}

interface OnboardingItem {
  id: 'connect-meta' | 'select-page' | 'select-account' | 'create-campaign' | 'review-campaign';
  label: string;
  help: string;
  done: boolean;
  actionLabel: string;
  secondaryActionLabel?: string;
}

type SortField = 'name' | 'ctr' | 'cpa' | 'roas' | 'score' | 'status';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-campaigns',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    UiBadgeComponent,
    UiStateComponent,
    CampaignCreatePanelComponent,
  ],
  templateUrl: './campaigns.component.html',
  styleUrls: ['./campaigns.component.scss'],
})
export class CampaignsComponent implements OnInit {
  private apiService = inject(ApiService);
  private authService = inject(AuthService);
  readonly accountContext = inject(AccountContextService);
  private ui = inject(UiService);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  storeContext = inject(StoreContextService);

  campaigns = signal<Campaign[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  searchTerm = signal('');
  filter = signal<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');
  expanded = signal<string | null>(null);
  currentPage = signal(1);
  pageSize = signal(10);
  sortField = signal<SortField>('name');
  sortDirection = signal<SortDirection>('asc');
  selectedReport = signal<Campaign | null>(null);
  createPanelOpen = signal(false);
  createPanelMode = signal<'manual' | 'ai'>('manual');
  createPanelResumeDraft = signal(false);
  createPanelInitialTarget = signal<'configuration' | 'review' | null>(null);
  creationNotice = signal<CampaignCreationNotice | null>(null);
  highlightedCampaignId = signal<string | null>(null);
  actionLoadingId = signal<string | null>(null);
  editingCampaign = signal<Campaign | null>(null);
  statusAction = signal<CampaignStatusAction | null>(null);
  integration = signal<StoreIntegration | null>(null);
  syncedAdAccounts = signal<AdAccount[]>([]);
  onboardingCollapsed = signal(false);
  onboardingClosed = signal(false);
  onboardingDraftAvailable = signal(false);
  onboardingReviewVisited = signal(false);
  editName = '';

  private searchSubject = new Subject<string>();
  private pendingRouteStoreId: string | null = null;
  private pendingOpenCreateFromRoute = false;
  private pendingRouteCreateMode: 'manual' | 'ai' = 'manual';
  private pendingRouteResumeDraft = false;
  private pendingRouteTarget: 'configuration' | 'review' = 'configuration';
  private pendingCreatedMetaCampaignId: string | null = null;
  private campaignListRequestId = 0;
  private onboardingContextRequestId = 0;

  filtered = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const filteredCampaigns = this.campaigns().filter((campaign) => {
      const matchesStatus = this.filter() === 'ALL' || campaign.status === this.filter();
      const matchesSearch = !query
        || campaign.name.toLowerCase().includes(query)
        || campaign.id.toLowerCase().includes(query)
        || campaign.metaId?.toLowerCase().includes(query)
        || campaign.store?.name?.toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    });

    const field = this.sortField();
    const direction = this.sortDirection();
    const multiplier = direction === 'asc' ? 1 : -1;

    return filteredCampaigns.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (field) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          return multiplier * aVal.localeCompare(bVal);
        case 'status':
          aVal = a.status;
          bVal = b.status;
          return multiplier * aVal.localeCompare(bVal);
        case 'ctr':
        case 'cpa':
        case 'roas':
        case 'score':
          aVal = a.metrics?.[field] ?? 0;
          bVal = b.metrics?.[field] ?? 0;
          return multiplier * (aVal - bVal);
        default:
          return 0;
      }
    });
  });

  pagedCampaigns = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });

  totalItems = computed(() => this.filtered().length);
  totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize())));
  pageNumbers = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const start = Math.max(1, current - 2);
    const end = Math.min(total, start + 4);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });
  pageStart = computed(() => (this.totalItems() ? (this.currentPage() - 1) * this.pageSize() + 1 : 0));
  pageEnd = computed(() => (this.totalItems() ? Math.min(this.currentPage() * this.pageSize(), this.totalItems()) : 0));
  activeCount = computed(() => this.campaigns().filter((campaign) => campaign.status === 'ACTIVE').length);
  pausedCount = computed(() => this.campaigns().filter((campaign) => campaign.status === 'PAUSED').length);
  archivedCount = computed(() => this.campaigns().filter((campaign) => campaign.status === 'ARCHIVED').length);
  averageRoas = computed(() => {
    const totals = this.realMetricsTotals();
    if (totals.spend <= 0 || totals.revenue <= 0) {
      return null;
    }

    return totals.revenue / totals.spend;
  });
  selectedScopeName = computed(() => this.storeContext.selectedStore()?.name || (this.accountContext.isIndividualAccount() ? 'Minha empresa' : 'Todas as lojas'));
  hasAnyRealMetrics = computed(() => this.campaigns().some((campaign) => this.hasRealMetrics(campaign)));
  totalCtr = computed(() => {
    const totals = this.realMetricsTotals();
    return totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null;
  });
  totalCpc = computed(() => {
    const totals = this.realMetricsTotals();
    return totals.clicks > 0 ? totals.spend / totals.clicks : null;
  });
  totalCpa = computed(() => {
    const totals = this.realMetricsTotals();
    return totals.conversions > 0 ? totals.spend / totals.conversions : null;
  });
  readonly demoModeEnabled = environment.enableDemoData === true;
  readonly onboardingItems = computed<OnboardingItem[]>(() => {
    const hasDraft = this.onboardingDraftAvailable();
    return [
      {
        id: 'connect-meta',
        label: 'Conectar conta Meta',
        help: 'Permite criar campanhas diretamente na sua conta.',
        done: this.integration()?.status === IntegrationStatus.CONNECTED,
        actionLabel: 'Conectar agora',
      },
      {
        id: 'select-page',
        label: 'Selecionar página',
        help: 'A página será usada como identidade principal da campanha.',
        done: !!this.integration()?.pageId,
        actionLabel: 'Configurar página',
      },
      {
        id: 'select-account',
        label: 'Selecionar conta de anúncio',
        help: 'Libera o envio da campanha para a conta certa.',
        done: this.syncedAdAccounts().length > 0,
        actionLabel: 'Selecionar conta',
      },
      {
        id: 'create-campaign',
        label: 'Criar primeira campanha',
        help: 'Você pode começar pelo fluxo manual e usar IA se quiser.',
        done: this.campaigns().length > 0,
        actionLabel: hasDraft ? 'Continuar rascunho' : 'Criar campanha',
        secondaryActionLabel: hasDraft ? 'Criar do zero' : 'Usar IA',
      },
      {
        id: 'review-campaign',
        label: 'Revisar campanha',
        help: 'A revisão final confirma se tudo está pronto para envio.',
        done: this.onboardingReviewVisited(),
        actionLabel: hasDraft ? 'Continuar criação' : 'Abrir revisão',
      },
    ];
  });
  readonly onboardingCompletedCount = computed(() => this.onboardingItems().filter((item) => item.done).length);
  readonly onboardingTotalCount = computed(() => this.onboardingItems().length);
  readonly onboardingProgressPercent = computed(() => {
    const total = this.onboardingTotalCount();
    return total > 0 ? Math.round((this.onboardingCompletedCount() / total) * 100) : 0;
  });
  readonly onboardingComplete = computed(() =>
    this.onboardingTotalCount() > 0 && this.onboardingCompletedCount() === this.onboardingTotalCount(),
  );
  readonly shouldShowOnboarding = computed(() =>
    this.canCreateCampaigns()
    && !!this.storeContext.getValidSelectedStoreId()
    && !this.onboardingComplete()
    && !this.onboardingClosed(),
  );
  readonly shouldShowOnboardingReopen = computed(() =>
    this.canCreateCampaigns()
    && !!this.storeContext.getValidSelectedStoreId()
    && !this.onboardingComplete()
    && this.onboardingClosed(),
  );
  readonly shouldShowOnboardingReady = computed(() =>
    this.canCreateCampaigns()
    && !!this.storeContext.getValidSelectedStoreId()
    && this.onboardingComplete(),
  );

  constructor() {
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((term) => {
        this.searchTerm.set(term);
        this.currentPage.set(1);
      });

    effect(() => {
      this.updateQueryParams();
    });

    effect(() => {
      if (!this.storeContext.loaded()) return;

      this.storeContext.selectedStoreId();
      this.applyRouteIntent();
      this.syncOnboardingUiState();
      this.syncOnboardingProgressState();
      this.loadOnboardingContext();
      this.loadCampaigns();
    });
  }

  ngOnInit(): void {
    this.storeContext.load();

    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const page = parseInt(params['page'] || '1', 10);
        if (!Number.isNaN(page) && page >= 1) {
          this.currentPage.set(page);
        }

        const sort = params['sort'];
        const dir = params['dir'] === 'desc' ? 'desc' : 'asc';
        if (sort && ['name', 'ctr', 'cpa', 'roas', 'score', 'status'].includes(sort)) {
          this.sortField.set(sort as SortField);
          this.sortDirection.set(dir);
        }

        this.pendingRouteStoreId = typeof params['storeId'] === 'string' ? params['storeId'] : null;
        this.pendingOpenCreateFromRoute =
          params['openCreate'] === '1'
          || params['openCreate'] === 'true'
          || params['action'] === 'create';
        this.pendingRouteCreateMode = params['createMode'] === 'ai' ? 'ai' : 'manual';
        this.pendingRouteResumeDraft = params['resumeDraft'] === '1' || params['resumeDraft'] === 'true';
        this.pendingRouteTarget = params['startAt'] === 'review' ? 'review' : 'configuration';

        this.applyRouteIntent();
      });
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (this.editingCampaign()) {
      this.closeEditModal();
      return;
    }
    if (this.statusAction()) {
      this.closeStatusActionModal();
      return;
    }
    if (this.selectedReport()) {
      this.closeReport();
    }
  }

  refresh(): void {
    this.loadCampaigns();
  }

  openCreateCampaign(
    mode: 'manual' | 'ai' = 'manual',
    options?: { resumeDraft?: boolean; target?: 'configuration' | 'review' },
  ): void {
    if (!this.canCreateCampaigns()) {
      this.ui.showWarning(
        'Criação indisponível',
        'Seu perfil pode analisar campanhas, mas a criação real fica disponível para Operação.',
      );
      return;
    }

    this.createPanelMode.set(mode);
    this.createPanelResumeDraft.set(!!options?.resumeDraft);
    this.createPanelInitialTarget.set(options?.target === 'review' ? 'review' : options?.target === 'configuration' ? 'configuration' : null);
    this.createPanelOpen.set(true);
  }

  openCreatePanel(mode: 'manual' | 'ai' = 'manual'): void {
    this.openCreateCampaign(mode);
  }

  closeCreatePanel(): void {
    this.createPanelOpen.set(false);
    this.createPanelResumeDraft.set(false);
    this.createPanelInitialTarget.set(null);
  }

  handleCampaignCreated(event: CampaignCreateSuccessEvent): void {
    this.creationNotice.set({
      name: event.name,
      storeName: event.storeName,
      response: event.response,
    });
    this.pendingCreatedMetaCampaignId = event.response.campaignId;
    this.createPanelOpen.set(false);
    this.refresh();
  }

  dismissCreationNotice(): void {
    this.creationNotice.set(null);
  }

  creationStatusLabel(notice: CampaignCreationNotice): string {
    return 'pausada';
  }

  setFilter(filterValue: 'ALL' | 'ACTIVE' | 'PAUSED'): void {
    this.filter.set(filterValue);
    this.currentPage.set(1);
  }

  setStoreFilter(storeId: string): void {
    this.storeContext.select(storeId);
    this.currentPage.set(1);
    this.highlightedCampaignId.set(null);
  }

  setSearchTerm(value: string): void {
    this.searchSubject.next(value);
  }

  toggleSort(field: SortField): void {
    if (this.sortField() === field) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortDirection.set('asc');
    }
  }

  getSortIndicator(field: SortField): string {
    if (this.sortField() !== field) return '';
    return this.sortDirection() === 'asc' ? ' ↑' : ' ↓';
  }

  canCreateCampaigns(): boolean {
    return this.authService.hasAnyRole([Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL]);
  }

  isIndividualAccount(): boolean {
    return this.accountContext.isIndividualAccount();
  }

  canManageOperations(): boolean {
    return this.authService.hasAnyRole([Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL]);
  }

  createButtonHint(): string {
    return this.canCreateCampaigns()
      ? 'Abrir builder de campanha'
      : 'Criação real disponível para Administração, Operação e Plataforma.';
  }

  creationOverviewLabel(): string {
    if (!this.canCreateCampaigns()) return 'Acompanhamento';
    if (!this.storeContext.getValidSelectedStoreId()) return this.isIndividualAccount() ? 'Conta em preparação' : 'Selecione uma store';
    return this.isIndividualAccount() ? 'Fluxo simplificado' : 'Builder centralizado';
  }

  creationOverviewMessage(): string {
    if (!this.canCreateCampaigns()) {
      return 'Seu perfil acompanha análise, status e relatório das campanhas.';
    }
    if (!this.storeContext.getValidSelectedStoreId()) {
      return this.isIndividualAccount()
        ? 'Conecte a Meta e finalize a configuração inicial para criar campanhas.'
        : 'Escolha uma store para criar, revisar e enviar novas campanhas.';
    }
    return this.isIndividualAccount()
      ? 'Abra o builder para criar campanhas direto com a configuração da sua empresa.'
      : `Abra o builder para revisar setup, preview e envio de ${this.selectedScopeName()}.`;
  }

  onboardingStatusLabel(done: boolean): string {
    return done ? 'Concluído' : 'Pendente';
  }

  onboardingStatusTone(done: boolean): 'success' | 'warning' {
    return done ? 'success' : 'warning';
  }

  toggleOnboardingCollapsed(): void {
    const nextValue = !this.onboardingCollapsed();
    this.onboardingCollapsed.set(nextValue);
    this.persistOnboardingPreference('collapsed', nextValue);
  }

  dismissOnboarding(): void {
    this.onboardingClosed.set(true);
    this.persistOnboardingPreference('closed', true);
  }

  reopenOnboarding(): void {
    this.onboardingClosed.set(false);
    this.persistOnboardingPreference('closed', false);
  }

  runOnboardingAction(itemId: OnboardingItem['id']): void {
    if (itemId === 'connect-meta' || itemId === 'select-page' || itemId === 'select-account') {
      this.goToIntegrations();
      return;
    }

    if (itemId === 'review-campaign') {
      this.openCreateCampaign('manual', {
        resumeDraft: this.onboardingDraftAvailable(),
        target: this.onboardingDraftAvailable() ? 'review' : 'configuration',
      });
      return;
    }

    this.openCreateCampaign('manual', {
      resumeDraft: this.onboardingDraftAvailable(),
      target: 'configuration',
    });
  }

  runOnboardingSecondaryAction(itemId: OnboardingItem['id']): void {
    if (itemId !== 'create-campaign') {
      return;
    }

    if (this.onboardingDraftAvailable()) {
      this.openCreateCampaign('manual', { target: 'configuration' });
      return;
    }

    this.openCreateCampaign('ai', { target: 'configuration' });
  }

  onboardingTrackById(_: number, item: OnboardingItem): string {
    return item.id;
  }

  hasPrev(): boolean {
    return this.currentPage() > 1;
  }

  hasNext(): boolean {
    return this.currentPage() < this.totalPages();
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  prevPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update((value) => value - 1);
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update((value) => value + 1);
    }
  }

  toggleExpand(campaignId: string): void {
    this.expanded.set(this.expanded() === campaignId ? null : campaignId);
  }

  isHighlighted(campaignId: string): boolean {
    return this.highlightedCampaignId() === campaignId;
  }

  openReport(campaign: Campaign, event?: Event): void {
    event?.stopPropagation();
    this.selectedReport.set(campaign);
  }

  closeReport(): void {
    this.selectedReport.set(null);
  }

  editCampaign(campaign: Campaign, event?: Event): void {
    event?.stopPropagation();
    if (!this.canManageOperations() || this.actionLoadingId()) return;

    this.editName = campaign.name;
    this.editingCampaign.set(campaign);
  }

  closeEditModal(): void {
    this.editingCampaign.set(null);
    this.editName = '';
  }

  saveCampaignEdit(): void {
    const campaign = this.editingCampaign();
    const nextName = this.editName.trim();
    if (!campaign || !nextName || nextName === campaign.name) {
      this.closeEditModal();
      return;
    }

    this.updateCampaign(campaign, { name: nextName }, 'Campanha atualizada', 'Não foi possível atualizar a campanha.');
    this.closeEditModal();
  }

  pauseCampaign(campaign: Campaign, event?: Event): void {
    event?.stopPropagation();
    if (!this.canManageOperations() || this.actionLoadingId()) return;
    this.statusAction.set({ campaign, nextStatus: 'PAUSED' });
  }

  activateCampaign(campaign: Campaign, event?: Event): void {
    event?.stopPropagation();
    if (!this.canManageOperations() || this.actionLoadingId()) return;
    this.statusAction.set({ campaign, nextStatus: 'ACTIVE' });
  }

  closeStatusActionModal(): void {
    this.statusAction.set(null);
  }

  confirmStatusAction(): void {
    const action = this.statusAction();
    if (!action) return;
    this.updateCampaignStatus(action.campaign, action.nextStatus);
    this.closeStatusActionModal();
  }

  isCampaignActionLoading(campaignId: string): boolean {
    return this.actionLoadingId() === campaignId;
  }

  statusActionVerb(action: CampaignStatusAction): string {
    return action.nextStatus === 'ACTIVE' ? 'ativar' : 'pausar';
  }

  statusActionTitle(action: CampaignStatusAction): string {
    return action.nextStatus === 'ACTIVE' ? 'Ativar campanha?' : 'Pausar campanha?';
  }

  statusActionImpact(action: CampaignStatusAction): string {
    return action.nextStatus === 'ACTIVE'
      ? 'A campanha voltará para o status ativo na Nexora e poderá ser considerada em fluxos operacionais.'
      : 'A campanha deixará de ser tratada como ativa na Nexora até uma nova ativação.';
  }

  fmt(value: number): string {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  fmtPct(value: number): string {
    return value.toFixed(1);
  }

  fmtCurrency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  fmtRoas(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value) || value < 0) {
      return '—';
    }

    return `${value.toFixed(2)}x`;
  }

  scoreColor(score: number): string {
    if (score >= 90) return '#16A34A';
    if (score >= 70) return '#2563EB';
    if (score >= 40) return '#F59E0B';
    return '#DC2626';
  }

  statusLabel(status: Campaign['status']): string {
    if (status === 'ACTIVE') return 'Ativa';
    if (status === 'PAUSED') return 'Pausada';
    return 'Arquivada';
  }

  statusTone(status: Campaign['status']): 'success' | 'warning' | 'neutral' {
    if (status === 'ACTIVE') return 'success';
    if (status === 'PAUSED') return 'warning';
    return 'neutral';
  }

  metricSourceLabel(): string {
    return this.demoModeEnabled ? 'Dados de demonstração' : 'Métricas reais';
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  trackByTypeTitle(_: number, item: CampaignInsight): string {
    return `${item.type}:${item.title}`;
  }

  trackByPage(_: number, page: number): number {
    return page;
  }

  private updateQueryParams(): void {
    const queryParams: Record<string, string | number> = {};

    if (this.currentPage() > 1) {
      queryParams['page'] = this.currentPage();
    }
    if (this.sortField() !== 'name') {
      queryParams['sort'] = this.sortField();
    }
    if (this.sortDirection() === 'desc') {
      queryParams['dir'] = 'desc';
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : {},
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private loadCampaigns(): void {
    const selectedStoreId = this.storeContext.getValidSelectedStoreId();
    const requestId = ++this.campaignListRequestId;
    if (!this.storeContext.loaded()) {
      return;
    }
    if (this.storeContext.selectedStoreId() && !selectedStoreId) {
      this.error.set('A loja selecionada não pertence ao usuário atual. Selecione uma loja válida.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.apiService
      .getCampaigns({ page: 1, limit: 500 }, selectedStoreId || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (!this.isCurrentCampaignListRequest(requestId, selectedStoreId)) return;
          const totalPages = response.meta.totalPages;
          if (totalPages <= 1) {
            this.applyLoadedCampaigns(response.data, requestId, selectedStoreId);
            return;
          }

          const remainingPages = Array.from({ length: totalPages - 1 }, (_, index) => index + 2);
          forkJoin(
            remainingPages.map((page) =>
              this.apiService.getCampaigns({ page, limit: response.meta.limit }, selectedStoreId || undefined),
            ),
          )
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (responses) => {
                if (!this.isCurrentCampaignListRequest(requestId, selectedStoreId)) return;
                this.applyLoadedCampaigns([
                  ...response.data,
                  ...responses.flatMap((item) => item.data),
                ], requestId, selectedStoreId);
              },
              error: () => {
                if (!this.isCurrentCampaignListRequest(requestId, selectedStoreId)) return;
                this.error.set('Não foi possível carregar todas as campanhas no momento.');
                this.loading.set(false);
              },
            });
        },
        error: () => {
          if (!this.isCurrentCampaignListRequest(requestId, selectedStoreId)) return;
          this.error.set('Não foi possível carregar campanhas no momento.');
          this.loading.set(false);
        },
      });
  }

  private applyLoadedCampaigns(campaigns: Campaign[], requestId: number, selectedStoreId: string | null): void {
    if (!this.isCurrentCampaignListRequest(requestId, selectedStoreId)) return;
    this.campaigns.set(campaigns);
    this.loading.set(false);

    if (this.pendingCreatedMetaCampaignId) {
      const createdCampaign = campaigns.find((campaign) => campaign.metaId === this.pendingCreatedMetaCampaignId);
      if (createdCampaign) {
        this.highlightedCampaignId.set(createdCampaign.id);
        this.expanded.set(createdCampaign.id);
      }
      this.pendingCreatedMetaCampaignId = null;
    }
  }

  private isCurrentCampaignListRequest(requestId: number, selectedStoreId: string | null): boolean {
    return requestId === this.campaignListRequestId
      && selectedStoreId === this.storeContext.getValidSelectedStoreId();
  }

  private updateCampaignStatus(campaign: Campaign, status: 'ACTIVE' | 'PAUSED'): void {
    if (!this.canManageOperations() || this.actionLoadingId() || campaign.status === status) return;

    const label = status === 'ACTIVE' ? 'Campanha ativada' : 'Campanha pausada';
    const error = status === 'ACTIVE'
      ? 'Não foi possível ativar a campanha.'
      : 'Não foi possível pausar a campanha.';
    this.updateCampaign(campaign, { status }, label, error);
  }

  private updateCampaign(
    campaign: Campaign,
    changes: Partial<Pick<Campaign, 'name' | 'status'>>,
    successTitle: string,
    errorMessage: string,
  ): void {
    this.actionLoadingId.set(campaign.id);
    this.apiService.updateCampaign(campaign.id, changes)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          const updatedCampaign = updated as Campaign;
          this.campaigns.update((items) => items.map((item) => item.id === campaign.id ? updatedCampaign : item));
          if (this.selectedReport()?.id === campaign.id) {
            this.selectedReport.set(updatedCampaign);
          }
          this.actionLoadingId.set(null);
          this.ui.showSuccess(successTitle, updatedCampaign.name);
        },
        error: (err) => {
          this.actionLoadingId.set(null);
          this.ui.showError('Ação não concluída', err?.message || errorMessage);
        },
      });
  }

  hasRealMetrics(campaign: Campaign): boolean {
    const metrics = campaign.metrics;
    if (!metrics) {
      return false;
    }

    return [
      metrics.impressions,
      metrics.clicks,
      metrics.spend,
      metrics.conversions,
      metrics.revenue,
      metrics.ctr,
      metrics.cpc,
      metrics.cpa,
      metrics.roas,
      metrics.score,
    ].some((value) => typeof value === 'number' && Number.isFinite(value));
  }

  hasInsights(campaign: Campaign): boolean {
    return (campaign.insights?.length ?? 0) > 0;
  }

  emptyMetricsMessage(): string {
    return 'Sem métricas reais disponíveis no período selecionado.';
  }

  campaignMetricsMessage(campaign: Campaign): string {
    return this.hasRealMetrics(campaign)
      ? 'Métricas reais disponíveis para esta campanha.'
      : 'Sem métricas reais disponíveis para esta campanha no período selecionado.';
  }

  reportInsights(campaign: Campaign): string[] {
    const insights = campaign.insights ?? [];
    if (!insights.length) {
      return [];
    }

    return insights
      .map((insight) => insight.title || insight.message || insight.recommendation || '')
      .filter((value) => value.trim().length > 0);
  }

  private realMetricsTotals(): {
    impressions: number;
    clicks: number;
    spend: number;
    conversions: number;
    revenue: number;
  } {
    return this.campaigns().reduce((totals, campaign) => {
      if (!this.hasRealMetrics(campaign) || !campaign.metrics) {
        return totals;
      }

      return {
        impressions: totals.impressions + Number(campaign.metrics.impressions || 0),
        clicks: totals.clicks + Number(campaign.metrics.clicks || 0),
        spend: totals.spend + Number(campaign.metrics.spend || 0),
        conversions: totals.conversions + Number(campaign.metrics.conversions || 0),
        revenue: totals.revenue + Number(campaign.metrics.revenue || 0),
      };
    }, {
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
      revenue: 0,
    });
  }

  private applyRouteIntent(): void {
    if (!this.storeContext.loaded()) return;

    let shouldClearParams = false;

    if (this.pendingRouteStoreId !== null) {
      shouldClearParams = true;
      const requestedStoreId = this.pendingRouteStoreId.trim();
      this.pendingRouteStoreId = null;

      if (requestedStoreId) {
        if (this.storeContext.hasAccessToStore(requestedStoreId)) {
          if (this.storeContext.selectedStoreId() !== requestedStoreId) {
            this.storeContext.select(requestedStoreId);
          }
        } else {
          this.ui.showWarning('Loja inválida', 'A loja enviada pela navegação não pertence ao usuário atual.');
        }
      }
    }

    if (this.pendingOpenCreateFromRoute) {
      shouldClearParams = true;
      this.pendingOpenCreateFromRoute = false;

      if (this.canCreateCampaigns()) {
        this.openCreateCampaign(this.pendingRouteCreateMode, {
          resumeDraft: this.pendingRouteResumeDraft,
          target: this.pendingRouteTarget,
        });
      } else {
        this.ui.showWarning(
          'Criação indisponível',
          'Seu perfil pode acompanhar campanhas, mas a criação real fica disponível para Administração e Operação.',
        );
      }
    }

    if (shouldClearParams) {
      this.clearCreateRouteParams();
    }
  }

  private clearCreateRouteParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { action: null, openCreate: null, storeId: null, createMode: null, resumeDraft: null, startAt: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private loadOnboardingContext(): void {
    const storeId = this.storeContext.getValidSelectedStoreId();
    const requestId = ++this.onboardingContextRequestId;

    if (!storeId) {
      this.integration.set(null);
      this.syncedAdAccounts.set([]);
      return;
    }

    forkJoin({
      integration: this.apiService.getMetaIntegrationStatus(storeId),
      adAccounts: this.apiService.getAdAccounts(storeId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ integration, adAccounts }) => {
          if (requestId !== this.onboardingContextRequestId || storeId !== this.storeContext.getValidSelectedStoreId()) {
            return;
          }
          this.integration.set(integration);
          this.syncedAdAccounts.set(adAccounts || []);
        },
        error: () => {
          if (requestId !== this.onboardingContextRequestId) {
            return;
          }
          this.integration.set(null);
          this.syncedAdAccounts.set([]);
        },
      });
  }

  private syncOnboardingProgressState(): void {
    const storeId = this.storeContext.getValidSelectedStoreId() || this.storeContext.selectedStoreId();
    this.onboardingDraftAvailable.set(this.readStorageFlag(this.builderDraftStorageKey(storeId)));
    this.onboardingReviewVisited.set(this.readStorageFlag(this.reviewVisitedStorageKey(storeId)));
  }

  private syncOnboardingUiState(): void {
    const storeId = this.storeContext.getValidSelectedStoreId() || this.storeContext.selectedStoreId();
    this.onboardingCollapsed.set(this.readStorageFlag(this.onboardingPreferenceKey('collapsed', storeId)));
    this.onboardingClosed.set(this.readStorageFlag(this.onboardingPreferenceKey('closed', storeId)));
  }

  private persistOnboardingPreference(kind: 'collapsed' | 'closed', value: boolean): void {
    const storeId = this.storeContext.getValidSelectedStoreId() || this.storeContext.selectedStoreId();
    try {
      if (value) {
        localStorage.setItem(this.onboardingPreferenceKey(kind, storeId), '1');
      } else {
        localStorage.removeItem(this.onboardingPreferenceKey(kind, storeId));
      }
    } catch {
      // localStorage is optional for onboarding preferences
    }
  }

  private onboardingPreferenceKey(kind: 'collapsed' | 'closed', storeId: string): string {
    return `metaiq.campaigns.onboarding.${kind}.${storeId || 'global'}`;
  }

  private builderDraftStorageKey(storeId: string): string {
    return `metaiq.campaign-builder.v2.${storeId || 'global'}`;
  }

  private reviewVisitedStorageKey(storeId: string): string {
    return `metaiq.campaign-builder.review-visited.${storeId || 'global'}`;
  }

  private readStorageFlag(key: string): boolean {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  }

  private goToIntegrations(): void {
    const storeId = this.storeContext.getValidSelectedStoreId() || this.storeContext.selectedStoreId() || null;
    this.router.navigate(['/manager/integrations'], {
      queryParams: storeId ? { storeId } : undefined,
    });
  }
}
