import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

interface CampaignData {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  spend?: number;
  budget?: number;
  conversions?: number;
  roas?: number;
  cpa?: number;
  ctr?: number;
  score?: number;
}

@Component({
  selector: 'app-campaign-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="campaign-table-wrapper">
      <div class="table-header">
        <h3 class="table-title">Campanhas Ativas</h3>
        <div class="table-stats">
          <span class="stat" *ngIf="activeCampaigns > 0">
            <span class="stat-dot active"></span> {{ activeCampaigns }} ativas
          </span>
          <span class="stat" *ngIf="pausedCampaigns > 0">
            <span class="stat-dot paused"></span> {{ pausedCampaigns }} pausadas
          </span>
        </div>
      </div>

      <!-- Empty State -->
      <div class="empty-state" *ngIf="campaigns.length === 0">
        <div class="empty-icon">📊</div>
        <p class="empty-text">Nenhuma campanha encontrada</p>
        <p class="empty-subtext">Conecte sua conta Meta para visualizar campanhas</p>
      </div>

      <!-- Table -->
      <table class="campaigns-table" *ngIf="campaigns.length > 0">
        <thead>
          <tr>
            <th class="col-name">Campanha</th>
            <th class="col-status">Status</th>
            <th class="col-numeric">Gasto</th>
            <th class="col-numeric">Conversões</th>
            <th class="col-numeric">ROAS</th>
            <th class="col-numeric">CPA</th>
            <th class="col-numeric">CTR</th>
            <th class="col-score">Score</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let campaign of campaigns" class="campaign-row">
            <td class="col-name">
              <div class="campaign-info">
                <div class="campaign-name">{{ campaign.name }}</div>
                <div class="campaign-id">{{ campaign.id }}</div>
              </div>
            </td>
            <td class="col-status">
              <span class="status-badge" [ngClass]="'status-' + campaign.status | lowercase">
                {{ formatStatus(campaign.status) }}
              </span>
            </td>
            <td class="col-numeric">{{ formatCurrency(campaign.spend) }}</td>
            <td class="col-numeric">{{ campaign.conversions || 0 }}</td>
            <td class="col-numeric">{{ formatRoas(campaign.roas) }}</td>
            <td class="col-numeric">{{ formatCurrency(campaign.cpa) }}</td>
            <td class="col-numeric">{{ formatPercent(campaign.ctr) }}</td>
            <td class="col-score">
              <div class="score-bar">
                <div class="score-fill" [style.width.%]="campaign.score" [style.background]="getScoreColor(campaign.score)"></div>
              </div>
              <span class="score-text" [style.color]="getScoreColor(campaign.score)">{{ campaign.score }}%</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .campaign-table-wrapper {
      background: linear-gradient(135deg, #0f1320 0%, #131929 100%);
      border: 1px solid #1e2535;
      border-radius: 12px;
      padding: 24px;
      overflow: hidden;
    }

    .table-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .table-title {
      font-size: 16px;
      font-weight: 600;
      color: #f0f4ff;
      margin: 0;
    }

    .table-stats {
      display: flex;
      gap: 16px;
      font-size: 12px;
    }

    .stat {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #64748b;
    }

    .stat-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;

      &.active {
        background: #34d399;
      }

      &.paused {
        background: #fbbf24;
      }
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #64748b;
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .empty-text {
      font-size: 16px;
      font-weight: 500;
      color: #c8d3e8;
      margin-bottom: 4px;
    }

    .empty-subtext {
      font-size: 13px;
      color: #64748b;
    }

    .campaigns-table {
      width: 100%;
      border-collapse: collapse;
    }

    thead th {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 600;
      color: #64748b;
      padding: 12px 0;
      border-bottom: 1px solid #1e2535;
      text-align: left;

      &.col-name {
        width: 35%;
      }

      &.col-numeric,
      &.col-score {
        text-align: right;
      }
    }

    tbody tr {
      border-bottom: 1px solid rgba(30, 37, 53, 0.5);
      transition: background-color 0.2s ease;

      &:hover {
        background-color: rgba(110, 231, 247, 0.03);
      }

      &:last-child {
        border-bottom: none;
      }
    }

    tbody td {
      padding: 14px 0;
      font-size: 13px;
      color: #c8d3e8;
      vertical-align: middle;
    }

    .col-name {
      width: 35%;
    }

    .col-numeric,
    .col-score {
      text-align: right;
      font-family: 'Space Mono', monospace;
      font-size: 12px;
      color: #a0aec0;
    }

    .campaign-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .campaign-name {
      font-weight: 500;
      color: #f0f4ff;
    }

    .campaign-id {
      font-size: 11px;
      color: #64748b;
      font-family: 'Space Mono', monospace;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;

      &.status-active {
        background: rgba(52, 211, 153, 0.12);
        color: #34d399;
      }

      &.status-paused {
        background: rgba(251, 191, 36, 0.12);
        color: #fbbf24;
      }

      &.status-archived {
        background: rgba(74, 85, 104, 0.2);
        color: #718096;
      }
    }

    .score-bar {
      display: inline-flex;
      align-items: center;
      height: 4px;
      width: 60px;
      background: rgba(30, 37, 53, 0.8);
      border-radius: 2px;
      margin-right: 8px;
      vertical-align: middle;
    }

    .score-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.3s ease;
    }

    .score-text {
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      font-weight: 600;
    }

    @media (max-width: 1024px) {
      .campaigns-table {
        font-size: 12px;
      }

      tbody td {
        padding: 12px 0;
      }

      thead th {
        padding: 10px 0;
      }
    }
  `]
})
export class CampaignTableComponent {
  @Input() campaigns: CampaignData[] = [];

  get activeCampaigns(): number {
    return this.campaigns.filter(c => c.status === 'ACTIVE').length;
  }

  get pausedCampaigns(): number {
    return this.campaigns.filter(c => c.status === 'PAUSED').length;
  }

  formatStatus(status: string): string {
    const statusMap: { [key: string]: string } = {
      'ACTIVE': 'Ativa',
      'PAUSED': 'Pausada',
      'ARCHIVED': 'Arquivada'
    };
    return statusMap[status] || status;
  }

  formatCurrency(value?: number): string {
    if (!value || value === 0) return '—';
    if (value >= 1000) return 'R$' + (value / 1000).toFixed(1) + 'K';
    return 'R$' + value.toFixed(0);
  }

  formatPercent(value?: number): string {
    if (!value || value === 0) return '—';
    return value.toFixed(2) + '%';
  }

  formatRoas(value?: number): string {
    if (!value || value === 0) return '—';
    return value.toFixed(2) + '×';
  }

  getScoreColor(score?: number): string {
    if (!score) return '#64748b';
    if (score >= 80) return '#34d399';
    if (score >= 60) return '#6ee7f7';
    if (score >= 40) return '#fbbf24';
    return '#fc8181';
  }
}
