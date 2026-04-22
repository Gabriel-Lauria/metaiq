import { Component, DestroyRef, HostListener, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChartData } from 'chart.js';
import { forkJoin, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { UiBadgeComponent } from '../../core/components/ui-badge.component';
import { UiStateComponent } from '../../core/components/ui-state.component';
import { ChartComponent } from '../../core/components/chart.component';
import { Role, Store } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { StoreContextService } from '../../core/services/store-context.service';
import { UiService } from '../../core/services/ui.service';
import { CampaignCreatePanelComponent, CampaignCreateSuccessEvent } from './campaign-create-panel.component';

interface CampaignMetric {
  ctr: number;
  cpa: number;
  roas: number;
  score: number;
  spend: number;
  conversions: number;
  impressions: number;
  clicks: number;
}

interface CampaignInsight {
  type: string;
  title: string;
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
    ChartComponent,
    CampaignCreatePanelComponent,
  ],
  templateUrl: './campaigns.component.html',
  styleUrls: ['./campaigns.component.scss'],
})
export class CampaignsComponent implements OnInit {
  private apiService = inject(ApiService);
  private authService = inject(AuthService);
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
  creationNotice = signal<CampaignCreationNotice | null>(null);
  highlightedCampaignId = signal<string | null>(null);
  actionLoadingId = signal<string | null>(null);
  editingCampaign = signal<Campaign | null>(null);
  statusAction = signal<CampaignStatusAction | null>(null);
  editName = '';

  private searchSubject = new Subject<string>();
  private pendingRouteStoreId: string | null = null;
  private pendingOpenCreateFromRoute = false;
  private pendingCreatedMetaCampaignId: string | null = null;
  private campaignListRequestId = 0;

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
    const campaignsWithMetrics = this.campaigns().filter((campaign) => campaign.metrics?.roas != null);
    if (!campaignsWithMetrics.length) return 0;

    const totalRoas = campaignsWithMetrics.reduce((sum, campaign) => sum + (campaign.metrics?.roas ?? 0), 0);
    return totalRoas / campaignsWithMetrics.length;
  });
  selectedScopeName = computed(() => this.storeContext.selectedStore()?.name || 'Todas as lojas');

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

    effect(
      () => {
        if (!this.storeContext.loaded()) return;

        this.storeContext.selectedStoreId();
        this.applyRouteIntent();
        this.loadCampaigns();
      },
      { allowSignalWrites: true },
    );
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
        this.pendingOpenCreateFromRoute = params['openCreate'] === '1' || params['openCreate'] === 'true';

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

  openCreatePanel(): void {
    if (!this.canCreateCampaigns()) {
      this.ui.showWarning(
        'Criação indisponível',
        'Seu perfil pode analisar campanhas, mas a criação real fica disponível para Operação.',
      );
      return;
    }

    this.createPanelOpen.set(true);
  }

  closeCreatePanel(): void {
    this.createPanelOpen.set(false);
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
    const status = notice.response.initialStatus || notice.response.executionStatus;
    return status === 'ACTIVE' ? 'ativa' : 'pausada';
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
    if (!this.storeContext.getValidSelectedStoreId()) return 'Selecione uma store';
    return 'Builder centralizado';
  }

  creationOverviewMessage(): string {
    if (!this.canCreateCampaigns()) {
      return 'Seu perfil acompanha análise, status e relatório das campanhas.';
    }
    if (!this.storeContext.getValidSelectedStoreId()) {
      return 'Escolha uma store para criar, revisar e enviar novas campanhas.';
    }
    return `Abra o builder para revisar setup, preview e envio de ${this.selectedScopeName()}.`;
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
      ? 'A campanha voltará para o status ativo no MetaIQ e poderá ser considerada em fluxos operacionais.'
      : 'A campanha deixará de ser tratada como ativa no MetaIQ até uma nova ativação.';
  }

  campaignEvolutionChart(campaign: Campaign): ChartData<'line'> {
    const metrics = campaign.metrics;
    const spend = metrics?.spend || 0;
    const conversions = metrics?.conversions || 0;

    return {
      labels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'],
      datasets: [
        {
          label: 'Spend',
          data: [0.16, 0.23, 0.27, 0.34].map((value) => Math.round(spend * value)),
          borderColor: '#0f766e',
          backgroundColor: 'rgba(15, 118, 110, 0.12)',
          tension: 0.35,
          fill: true,
        },
        {
          label: 'Conversões',
          data: [0.18, 0.24, 0.25, 0.33].map((value) => Math.round(conversions * value)),
          borderColor: '#f97316',
          backgroundColor: 'rgba(249, 115, 22, 0.12)',
          tension: 0.35,
        },
      ],
    };
  }

  reportInsights(campaign: Campaign): string[] {
    const metrics = campaign.metrics;
    const insights = campaign.insights?.map((insight) => insight.title) || [];
    if (!metrics) return insights.length ? insights : ['Aguardando métricas para gerar insights.'];

    return [
      ...insights,
      metrics.roas < 2 ? 'ROAS baixo: revisar oferta, criativo e público.' : 'ROAS saudável para manter investimento controlado.',
      metrics.ctr < 1.5 ? 'CTR em queda: testar novos criativos e chamadas.' : 'CTR competitivo no período analisado.',
      metrics.cpa > 80 ? 'CPA em alta: reduzir verba até recuperar eficiência.' : 'CPA dentro da faixa esperada.',
    ].slice(0, 5);
  }

  fmt(value: number): string {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  fmtPct(value: number): string {
    return (value * 100).toFixed(1);
  }

  fmtCurrency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  scoreColor(score: number): string {
    if (score >= 80) return '#10b981';
    if (score >= 55) return '#f59e0b';
    return '#ef4444';
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
    return 'Métricas estimadas';
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
    this.campaigns.set(campaigns.map((campaign) => this.withPresentationMetrics(campaign)));
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
          const enhanced = this.withPresentationMetrics(updated as Campaign);
          this.campaigns.update((items) => items.map((item) => item.id === campaign.id ? enhanced : item));
          if (this.selectedReport()?.id === campaign.id) {
            this.selectedReport.set(enhanced);
          }
          this.actionLoadingId.set(null);
          this.ui.showSuccess(successTitle, enhanced.name);
        },
        error: (err) => {
          this.actionLoadingId.set(null);
          this.ui.showError('Ação não concluída', err?.message || errorMessage);
        },
      });
  }

  private withPresentationMetrics(campaign: Campaign): Campaign {
    if (campaign.metrics) return campaign;

    const seed = this.hashSeed(campaign.id || campaign.metaId || campaign.name);
    const dailyBudget = Number(campaign.dailyBudget || 0);
    const activeFactor = campaign.status === 'ACTIVE' ? 1 : campaign.status === 'PAUSED' ? 0.35 : 0.12;
    const spend = Math.round((dailyBudget > 0 ? dailyBudget * 21 : 650 + (seed % 900)) * activeFactor);
    const impressions = Math.max(0, Math.round((spend * (80 + (seed % 70))) || (seed % 14000)));
    const ctr = Number((1.1 + ((seed % 190) / 100)).toFixed(2));
    const clicks = Math.round(impressions * (ctr / 100));
    const conversions = Math.round(clicks * (0.025 + ((seed % 30) / 1000)));
    const cpa = conversions > 0 ? spend / conversions : 0;
    const roas = spend > 0 ? Number((1.2 + ((seed % 260) / 100)).toFixed(2)) : 0;
    const score = Math.max(35, Math.min(96, Math.round(45 + roas * 12 + ctr * 4 - cpa / 20)));

    return {
      ...campaign,
      metrics: {
        ctr,
        cpa,
        roas,
        score,
        spend,
        conversions,
        impressions,
        clicks,
      },
      insights: campaign.insights || this.presentationInsights(campaign.status, roas, ctr, cpa),
    };
  }

  private presentationInsights(status: Campaign['status'], roas: number, ctr: number, cpa: number): CampaignInsight[] {
    const statusInsight = status === 'ACTIVE'
      ? 'Campanha ativa: acompanhe entrega e custo por resultado diariamente.'
      : status === 'PAUSED'
        ? 'Campanha pausada: revise criativo e público antes de reativar.'
        : 'Campanha arquivada mantida apenas para histórico.';

    return [
      { type: 'INFO', title: statusInsight },
      { type: roas >= 2.5 ? 'OPORTUNIDADE' : 'ALERTA', title: roas >= 2.5 ? 'ROAS estimado saudável para escalar com cautela.' : 'ROAS estimado pede revisão de oferta.' },
      { type: ctr >= 1.8 ? 'INFO' : 'ALERTA', title: ctr >= 1.8 ? 'CTR estimado competitivo.' : 'CTR estimado baixo: teste nova chamada.' },
      { type: cpa <= 80 ? 'INFO' : 'ALERTA', title: cpa <= 80 ? 'CPA estimado dentro da faixa esperada.' : 'CPA estimado alto para este recorte.' },
    ];
  }

  private hashSeed(value: string): number {
    return value.split('').reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) >>> 0, 2166136261);
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
        this.createPanelOpen.set(true);
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
      queryParams: { openCreate: null, storeId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
