import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

interface MetricCardData {
  label: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  unit?: string;
  icon?: string;
  bgColor?: string;
}

@Component({
  selector: 'app-metric-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="metric-card" [style.background]="data.bgColor || cardBgColor">
      <div class="metric-header">
        <div class="metric-label">{{ data.label }}</div>
        <div class="metric-icon" *ngIf="data.icon">{{ data.icon }}</div>
      </div>
      
      <div class="metric-value">{{ data.value }}</div>
      
      <div class="metric-unit" *ngIf="data.unit">{{ data.unit }}</div>
      
      <div class="metric-change" [ngClass]="data.trend" *ngIf="data.change">
        <span class="trend-icon">{{ getTrendIcon(data.trend) }}</span>
        {{ data.change }}
      </div>
    </div>
  `,
  styles: [`
    .metric-card {
      background: linear-gradient(135deg, #0f1320 0%, #131929 100%);
      border: 1px solid #1e2535;
      border-radius: 12px;
      padding: 20px;
      transition: all 0.2s ease;
      cursor: pointer;
      position: relative;
      overflow: hidden;
    }

    .metric-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(135deg, rgba(110, 231, 247, 0.1) 0%, transparent 100%);
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    }

    .metric-card:hover {
      border-color: #2d3a50;
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    }

    .metric-card:hover::before {
      opacity: 1;
    }

    .metric-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .metric-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #64748b;
    }

    .metric-icon {
      font-size: 18px;
    }

    .metric-value {
      font-family: 'Space Mono', 'Courier New', monospace;
      font-size: 28px;
      font-weight: 700;
      color: #f0f4ff;
      line-height: 1;
      margin-bottom: 4px;
    }

    .metric-unit {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 8px;
    }

    .metric-change {
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
      font-weight: 500;
    }

    .metric-change.up {
      color: #34d399;
    }

    .metric-change.down {
      color: #fc8181;
    }

    .metric-change.neutral {
      color: #64748b;
    }

    .trend-icon {
      font-size: 14px;
      display: inline-flex;
      align-items: center;
    }

    @media (max-width: 768px) {
      .metric-card {
        padding: 16px;
      }

      .metric-value {
        font-size: 24px;
      }
    }
  `]
})
export class MetricCardComponent {
  @Input() data!: MetricCardData;
  @Input() cardBgColor = 'linear-gradient(135deg, #0f1320 0%, #131929 100%)';

  getTrendIcon(trend?: string): string {
    if (trend === 'up') return '↑';
    if (trend === 'down') return '↓';
    return '→';
  }
}
