import { Component, OnInit, DestroyRef, signal, computed, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChartData } from 'chart.js';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { Store, Role } from '../../core/models';
import { StoreContextService } from '../../core/services/store-context.service';
import { UiBadgeComponent } from '../../core/components/ui-badge.component';
import { UiStateComponent } from '../../core/components/ui-state.component';
import { ChartComponent } from '../../core/components/chart.component';

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
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  storeId?: string | null;
  store?: Store | null;
  metrics?: CampaignMetric;
  insights?: CampaignInsight[];
}

type SortField = 'name' | 'ctr' | 'cpa' | 'roas' | 'score' | 'status';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-campaigns',
  standalone: true,
  imports: [CommonModule, FormsModule, UiBadgeComponent, UiStateComponent, ChartComponent],
  templateUrl: './campaigns.component.html',
  styleUrls: ['./campaigns.component.scss']
})
export class CampaignsComponent implements OnInit {
  private apiService = inject(ApiService);
  private authService = inject(AuthService);
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
  private searchSubject = new Subject<string>();

  filtered = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    let filtered = this.campaigns().filter((campaign) => {
      const matchesStatus =
        this.filter() === 'ALL' || campaign.status === this.filter();
      const matchesSearch =
        !query ||
        campaign.name.toLowerCase().includes(query) ||
        campaign.id.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });

    // Aplicar ordenação
    const field = this.sortField();
    const direction = this.sortDirection();
    const multiplier = direction === 'asc' ? 1 : -1;

    return filtered.sort((a, b) => {
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

  sorted = computed(() => this.filtered());

  pagedCampaigns = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.sorted().slice(start, start + this.pageSize());
  });

  totalItems = computed(() => this.sorted().length);
  totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize())));
  pageNumbers = computed(() => Array.from({ length: this.totalPages() }, (_, index) => index + 1));
  pageStart = computed(() => (this.currentPage() - 1) * this.pageSize() + 1);
  pageEnd = computed(() => Math.min(this.currentPage() * this.pageSize(), this.totalItems()));

  constructor() {
    // Setup debounce para busca
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((term) => {
        this.searchTerm.set(term);
        this.currentPage.set(1);
        this.updateQueryParams();
      });

    // Sincronizar paginação com URL
    effect(() => {
      this.updateQueryParams();
    });

    effect(() => {
      if (!this.storeContext.loaded()) return;
      this.loadCampaigns();
    });
  }

  ngOnInit(): void {
    this.storeContext.load();
    // Restaurar estado da URL
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const page = parseInt(params['page'] || '1', 10);
        if (page >= 1) {
          this.currentPage.set(page);
        }

        const sort = params['sort'];
        if (sort && ['name', 'ctr', 'cpa', 'roas', 'score', 'status'].includes(sort)) {
          this.toggleSort(sort as SortField);
        }
      });
  }

  refresh(): void {
    this.loadCampaigns();
  }

  setFilter(filterValue: 'ALL' | 'ACTIVE' | 'PAUSED'): void {
    this.filter.set(filterValue);
    this.currentPage.set(1);
    this.updateQueryParams();
  }

  setStoreFilter(storeId: string): void {
    this.storeContext.select(storeId);
    this.currentPage.set(1);
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
    this.updateQueryParams();
  }

  getSortIndicator(field: SortField): string {
    if (this.sortField() !== field) return '';
    return this.sortDirection() === 'asc' ? ' ↑' : ' ↓';
  }

  private updateQueryParams(): void {
    const queryParams: any = {};
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
      queryParamsHandling: 'merge'
    });
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

  openReport(campaign: Campaign, event?: Event): void {
    event?.stopPropagation();
    this.selectedReport.set(campaign);
  }

  closeReport(): void {
    this.selectedReport.set(null);
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
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.14)',
          tension: 0.35,
          fill: true,
        },
        {
          label: 'Conversoes',
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
    if (!metrics) return insights.length ? insights : ['Aguardando metricas para gerar insights.'];

    return [
      ...insights,
      metrics.roas < 2 ? 'ROAS baixo: revisar oferta, criativo e publico.' : 'ROAS saudavel para manter investimento controlado.',
      metrics.ctr < 1.5 ? 'CTR em queda: testar novos criativos e chamadas.' : 'CTR competitivo no periodo analisado.',
      metrics.cpa > 80 ? 'CPA em alta: reduzir verba ate recuperar eficiencia.' : 'CPA dentro da faixa esperada.',
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
    if (score >= 80) return '#34d399';
    if (score >= 55) return '#fbbf24';
    return '#fc8181';
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

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  trackByTypeTitle(_: number, item: CampaignInsight): string {
    return `${item.type}:${item.title}`;
  }

  trackByPage(_: number, page: number): number {
    return page;
  }

  private loadCampaigns(): void {
    const selectedStoreId = this.storeContext.getValidSelectedStoreId();
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
      .getCampaigns(undefined, selectedStoreId || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.campaigns.set(response.data);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set('Não foi possível carregar campanhas no momento.');
          this.loading.set(false);
        }
      });
  }

  canManageOperations(): boolean {
    return this.authService.hasAnyRole([Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL]);
  }
}
