import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RankingItem } from '../models/financial.models';

@Component({
  selector: 'app-ranking-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="ranking-list">
      <div class="ranking-header">
        <p class="eyebrow">Ranking</p>
        <h2>{{ title }}</h2>
      </div>

      <div *ngIf="items?.length; else emptyState" class="ranking-items">
        <article *ngFor="let item of items; let index = index" class="ranking-item">
          <div class="ranking-index">#{{ index + 1 }}</div>
          <div class="ranking-content">
            <strong>{{ item.label }}</strong>
            <span>{{ item.detail }}</span>
          </div>
          <div class="ranking-value">{{ item.value }}</div>
        </article>
      </div>

      <ng-template #emptyState>
        <div class="ranking-empty">Nenhum ranking disponível.</div>
      </ng-template>
    </section>
  `,
  styles: [`
    .ranking-list {
      display: grid;
      gap: 16px;
      padding: 24px;
      border-radius: 24px;
      background: #ffffff;
      box-shadow: var(--shadow);
    }

    .ranking-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      color: var(--text);
    }

    .ranking-items {
      display: grid;
      gap: 12px;
    }

    .ranking-item {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 16px;
      align-items: center;
      padding: 16px;
      border-radius: 18px;
      border: 1px solid var(--border);
      background: #f8fafc;
    }

    .ranking-index {
      min-width: 36px;
      min-height: 36px;
      display: grid;
      place-items: center;
      border-radius: 14px;
      background: var(--bg-surface);
      color: var(--primary);
      font-weight: 800;
    }

    .ranking-content strong {
      display: block;
      font-size: 15px;
      color: var(--text);
      margin-bottom: 4px;
    }

    .ranking-content span {
      color: var(--text-muted);
      font-size: 13px;
    }

    .ranking-value {
      font-size: 15px;
      font-weight: 700;
      color: var(--primary-dark);
      text-align: right;
    }

    .ranking-empty {
      padding: 20px;
      border-radius: 18px;
      border: 1px solid var(--border);
      background: #ffffff;
      color: var(--text-muted);
      text-align: center;
    }

    @media (max-width: 680px) {
      .ranking-item {
        grid-template-columns: 1fr;
        text-align: left;
      }

      .ranking-value {
        text-align: left;
      }
    }
  `]
})
export class RankingListComponent {
  @Input() title = 'Ranking';
  @Input() items: RankingItem[] = [];
}
