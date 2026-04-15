import { Component, OnInit, DestroyRef, signal, computed, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { Store } from '../../core/models';
import { StoreContextService } from '../../core/services/store-context.service';

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
  imports: [CommonModule, FormsModule],
  templateUrl: './campaigns.component.html',
  styleUrls: ['./campaigns.component.scss']
})
export class CampaignsComponent implements OnInit {
  private apiService = inject(ApiService);
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

    this.loadCampaigns();
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
    this.loadCampaigns();
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

  fmt(value: number): string {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  fmtPct(value: number): string {
    return (value * 100).toFixed(1);
  }

  scoreColor(score: number): string {
    if (score >= 80) return '#34d399';
    if (score >= 55) return '#fbbf24';
    return '#fc8181';
  }

  private loadCampaigns(): void {
    this.loading.set(true);
    this.error.set(null);

    this.apiService
      .getCampaigns(undefined, this.storeContext.selectedStoreId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.campaigns.set(response.data);
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Erro ao carregar campanhas:', err);
          this.error.set('Não foi possível carregar campanhas no momento.');
          this.loading.set(false);
        }
      });
  }
}
