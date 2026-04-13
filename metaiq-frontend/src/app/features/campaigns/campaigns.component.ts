import { Component, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/services/api.service';

interface Campaign {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'ended';
  ctr: number;
  cpa: number;
  roas: number;
  score: number;
  spend: number;
  conversions: number;
  impressions: number;
  clicks: number;
}

@Component({
  selector: 'app-campaigns',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './campaigns.component.html',
  styleUrls: ['./campaigns.component.scss']
})
export class CampaignsComponent implements OnInit {
  filterForm!: FormGroup;
  campaigns: Campaign[] = [];
  filteredCampaigns: Campaign[] = [];
  expandedCampaignId: string | null = null;
  loading = true;
  searchTerm = '';

  constructor(
    private fb: FormBuilder,
    private apiService: ApiService,
    private destroyRef: DestroyRef
  ) {
    this.filterForm = this.fb.group({
      status: ['all']
    });
  }

  ngOnInit(): void {
    this.loadCampaigns();
    this.filterForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyFilters());
  }

  private loadCampaigns(): void {
    this.apiService
      .get('/api/campaigns')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data: Campaign[]) => {
          this.campaigns = data;
          this.applyFilters();
          this.loading = false;
        },
        error: (err) => {
          console.error('Erro ao carregar campanhas:', err);
          this.loadMockCampaigns();
          this.loading = false;
        }
      });
  }

  private loadMockCampaigns(): void {
    this.campaigns = [
      {
        id: 'camp_001',
        name: 'Conversão — Ecommerce Principal',
        status: 'active',
        ctr: 3.21,
        cpa: 32,
        roas: 4.2,
        score: 88,
        spend: 12500,
        conversions: 420,
        impressions: 125000,
        clicks: 4000
      },
      {
        id: 'camp_002',
        name: 'Leads — Formulário B2B',
        status: 'active',
        ctr: 1.87,
        cpa: 67,
        roas: 1.8,
        score: 42,
        spend: 8200,
        conversions: 122,
        impressions: 85000,
        clicks: 1600
      },
      {
        id: 'camp_003',
        name: 'Remarketing — Carrinho',
        status: 'active',
        ctr: 4.5,
        cpa: 18,
        roas: 6.1,
        score: 95,
        spend: 3600,
        conversions: 200,
        impressions: 40000,
        clicks: 1800
      },
      {
        id: 'camp_004',
        name: 'Brand Awareness Q1',
        status: 'paused',
        ctr: 0.92,
        cpa: 0,
        roas: 0,
        score: 29,
        spend: 5000,
        conversions: 0,
        impressions: 200000,
        clicks: 1600
      },
      {
        id: 'camp_005',
        name: 'Catálogo Dinâmico',
        status: 'active',
        ctr: 2.33,
        cpa: 44,
        roas: 3.4,
        score: 71,
        spend: 18900,
        conversions: 429,
        impressions: 145000,
        clicks: 3400
      }
    ];
    this.applyFilters();
  }

  private applyFilters(): void {
    let filtered = this.campaigns;

    // Status filter
    const status = this.filterForm.get('status')?.value;
    if (status && status !== 'all') {
      filtered = filtered.filter(c => c.status === status);
    }

    // Search filter
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(
        c =>
          c.name.toLowerCase().includes(term) ||
          c.id.toLowerCase().includes(term)
      );
    }

    this.filteredCampaigns = filtered;
  }

  onSearch(term: string): void {
    this.searchTerm = term;
    this.applyFilters();
  }

  toggleExpand(campaignId: string): void {
    this.expandedCampaignId =
      this.expandedCampaignId === campaignId ? null : campaignId;
  }

  getScoreColor(score: number): string {
    if (score >= 80) return '#34d399';
    if (score >= 55) return '#fbbf24';
    return '#fc8181';
  }

  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      active: 'Ativa',
      paused: 'Pausada',
      ended: 'Encerrada'
    };
    return labels[status] || status;
  }
}
