import { Component, OnInit, DestroyRef, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/services/api.service';

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
  status: 'ACTIVE' | 'PAUSED' | 'ENDED';
  metrics?: CampaignMetric;
  insights?: CampaignInsight[];
}

@Component({
  selector: 'app-campaigns',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './campaigns.component.html',
  styleUrls: ['./campaigns.component.scss']
})
export class CampaignsComponent implements OnInit {
  campaigns = signal<Campaign[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  searchTerm = signal('');
  filter = signal<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');
  expanded = signal<string | null>(null);
  currentPage = signal(1);
  pageSize = signal(10);

  filtered = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    return this.campaigns().filter((campaign) => {
      const matchesStatus =
        this.filter() === 'ALL' || campaign.status === this.filter();
      const matchesSearch =
        !query ||
        campaign.name.toLowerCase().includes(query) ||
        campaign.id.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  });

  pagedCampaigns = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });

  totalItems = computed(() => this.filtered().length);
  totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize())));
  pageStart = computed(() => (this.currentPage() - 1) * this.pageSize() + 1);
  pageEnd = computed(() => Math.min(this.currentPage() * this.pageSize(), this.totalItems()));

  constructor(
    private apiService: ApiService,
    private destroyRef: DestroyRef
  ) {}

  ngOnInit(): void {
    this.loadCampaigns();
  }

  refresh(): void {
    this.loadCampaigns();
  }

  setFilter(filterValue: 'ALL' | 'ACTIVE' | 'PAUSED'): void {
    this.filter.set(filterValue);
    this.currentPage.set(1);
  }

  setSearchTerm(value: string): void {
    this.searchTerm.set(value);
    this.currentPage.set(1);
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
      .get('/campaigns')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response: Campaign[] | { data: Campaign[] }) => {
          const campaigns = Array.isArray(response) ? response : response.data;
          this.campaigns.set(campaigns);
          this.currentPage.set(1);
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
