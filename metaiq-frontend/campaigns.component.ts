import { Component, OnInit, OnDestroy, inject, signal, computed, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/services/api.service';
import { Campaign, AggregatedMetrics, Insight } from '../../core/models';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { FormatUtils } from '../../core/utils/format.utils';

interface CampaignRow extends Campaign {
  metrics?: AggregatedMetrics;
  insights?: Insight[];
}

@Component({
  selector: 'app-campaigns',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './campaigns.component.html',
  styleUrl: './campaigns.component.scss',
})
export class CampaignsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private destroyRef = inject(DestroyRef);

  campaigns = signal<CampaignRow[]>([]);
  loading   = signal(true);
  search    = signal('');
  filter    = signal<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');
  expanded  = signal<string | null>(null);

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
    this.api.getCampaigns()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (campaigns) => {
          this.campaigns.set(campaigns);
          this.loading.set(false);
          this.loadMetrics(campaigns);
        },
        error: (err) => {
          console.error('Erro ao carregar campanhas:', err);
          this.loading.set(false);
        },
      });
  }

  ngOnDestroy() {
    // Limpeza automática via takeUntilDestroyed
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

  toggleExpand(id: string): void {
    this.expanded.set(this.expanded() === id ? null : id);
  }

  setFilter(f: 'ALL' | 'ACTIVE' | 'PAUSED'): void {
    this.filter.set(f);
  }
}
