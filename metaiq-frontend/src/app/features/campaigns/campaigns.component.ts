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
  searchTerm = '';
  filter = signal<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');
  expanded = signal<string | null>(null);
  currentPage = signal(1);
  pageSize = signal(10);

  filtered = computed(() => {
    const query = this.searchTerm.trim().toLowerCase();
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
      .get('/api/campaigns')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data: Campaign[]) => {
          this.campaigns.set(data);
          this.currentPage.set(1);
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Erro ao carregar campanhas:', err);
          this.error.set('Não foi possível carregar campanhas no momento.');
          this.loadMockCampaigns();
          this.loading.set(false);
        }
      });
  }

  private loadMockCampaigns(): void {
    this.campaigns.set([
      {
        id: 'camp_001',
        name: 'Conversão — Ecommerce Principal',
        status: 'ACTIVE',
        metrics: {
          ctr: 3.21,
          cpa: 32,
          roas: 4.2,
          score: 88,
          spend: 12500,
          conversions: 420,
          impressions: 125000,
          clicks: 4000
        },
        insights: [
          { type: 'Performance', title: 'Melhor taxa de conversão nos últimos 7 dias' },
          { type: 'Custo', title: 'CPA dentro do objetivo' }
        ]
      },
      {
        id: 'camp_002',
        name: 'Leads — Formulário B2B',
        status: 'ACTIVE',
        metrics: {
          ctr: 1.87,
          cpa: 67,
          roas: 1.8,
          score: 42,
          spend: 8200,
          conversions: 122,
          impressions: 85000,
          clicks: 1600
        },
        insights: [
          { type: 'Oportunidade', title: 'Taxa de clique abaixo da média do setor' }
        ]
      },
      {
        id: 'camp_003',
        name: 'Remarketing — Carrinho',
        status: 'ACTIVE',
        metrics: {
          ctr: 4.5,
          cpa: 18,
          roas: 6.1,
          score: 95,
          spend: 3600,
          conversions: 200,
          impressions: 40000,
          clicks: 1800
        },
        insights: [
          { type: 'Remarketing', title: 'Alta eficiência de conversão nas últimas 48h' }
        ]
      },
      {
        id: 'camp_004',
        name: 'Brand Awareness Q1',
        status: 'PAUSED',
        metrics: {
          ctr: 0.92,
          cpa: 0,
          roas: 0,
          score: 29,
          spend: 5000,
          conversions: 0,
          impressions: 200000,
          clicks: 1600
        },
        insights: []
      },
      {
        id: 'camp_005',
        name: 'Catálogo Dinâmico',
        status: 'ACTIVE',
        metrics: {
          ctr: 2.33,
          cpa: 44,
          roas: 3.4,
          score: 71,
          spend: 18900,
          conversions: 429,
          impressions: 145000,
          clicks: 3400
        },
        insights: [
          { type: 'Criativo', title: 'Incentivar mais testes de criativos dinâmicos' }
        ]
      }
    ]);
  }
}
