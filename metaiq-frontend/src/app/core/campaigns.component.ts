import { Component, OnInit, OnDestroy, inject, signal, computed, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../services/api.service';
import { Campaign, AggregatedMetrics, Insight, PaginatedResponse } from '../models';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { FormatUtils } from '../utils/format.utils';
import { UiService } from '../services/ui.service';

interface CampaignRow extends Campaign {
  metrics?: AggregatedMetrics;
  insights?: Insight[];
}

@Component({
  selector: 'app-campaigns',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: '../../features/campaigns/campaigns.component.html',
  styleUrl: '../../features/campaigns/campaigns.component.scss',
})
export class CampaignsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private uiService = inject(UiService);
  private destroyRef = inject(DestroyRef);

  campaigns = signal<CampaignRow[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  search = signal('');
  filter = signal<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');
  expanded = signal<string | null>(null);

  // Paginação
  currentPage = signal(1);
  pageSize = signal(10);
  totalItems = signal(0);
  totalPages = signal(0);
  hasNext = signal(false);
  hasPrev = signal(false);

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    return this.campaigns().filter(c => {
      const matchSearch = c.name.toLowerCase().includes(q) || c.metaId.includes(q);
      const matchFilter = this.filter() === 'ALL' || c.status === this.filter();
      return matchSearch && matchFilter;
    });
  });

  // Expor utilitários para template
  readonly fmt = FormatUtils.currency;
  readonly fmtPct = FormatUtils.percent;
  readonly scoreColor = FormatUtils.scoreColor;

  ngOnInit() {
    this.loadCampaigns();
  }

  ngOnDestroy() {
    // Limpeza automática via takeUntilDestroyed
  }

  loadCampaigns(page = 1): void {
    this.loading.set(true);
    this.error.set(null);
    this.currentPage.set(page);

    this.api.getCampaigns(page, this.pageSize())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response: PaginatedResponse<Campaign>) => {
          this.campaigns.set(response.data);
          this.totalItems.set(response.meta.total);
          this.totalPages.set(response.meta.totalPages);
          this.hasNext.set(response.meta.hasNext);
          this.hasPrev.set(response.meta.hasPrev);
          this.loading.set(false);
          this.loadMetrics(response.data);
        },
        error: (err) => {
          console.error('Erro ao carregar campanhas:', err);
          this.error.set(err.message || 'Erro ao carregar campanhas');
          this.loading.set(false);
          this.uiService.showError('Erro', this.error()!);
        },
      });
  }

  private loadMetrics(campaigns: Campaign[]): void {
    if (!campaigns.length) return;

    const reqs = campaigns.map(c =>
      forkJoin({
        metrics: this.api.getCampaignAggregate(c.id).pipe(
          catchError(err => {
            console.warn(`Erro ao carregar métricas de ${c.id}:`, err);
            return of(null);
          })
        ),
        insights: this.api.getCampaignInsights(c.id).pipe(
          catchError(err => {
            console.warn(`Erro ao carregar insights de ${c.id}:`, err);
            return of([]);
          })
        ),
      })
    );

    forkJoin(reqs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((results) => {
        const updated = campaigns.map((c, i) => ({
          ...c,
          metrics: results[i].metrics ?? undefined,
          insights: results[i].insights ?? [],
        }));
        this.campaigns.set(updated);
      });
  }

  nextPage(): void {
    if (this.hasNext()) {
      this.loadCampaigns(this.currentPage() + 1);
    }
  }

  prevPage(): void {
    if (this.hasPrev()) {
      this.loadCampaigns(this.currentPage() - 1);
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.loadCampaigns(page);
    }
  }

  toggleExpand(id: string): void {
    this.expanded.set(this.expanded() === id ? null : id);
  }

  setFilter(f: 'ALL' | 'ACTIVE' | 'PAUSED'): void {
    this.filter.set(f);
  }

  refresh(): void {
    this.loadCampaigns(this.currentPage());
  }
}
