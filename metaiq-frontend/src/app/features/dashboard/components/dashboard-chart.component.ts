import { Component, Input, ViewChild, ElementRef, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
    fill?: boolean;
    tension?: number;
    pointRadius?: number;
    borderWidth?: number;
    yAxisID?: string;
  }>;
}

@Component({
  selector: 'app-dashboard-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart-wrapper">
      <div class="chart-header">
        <h3 class="chart-title">{{ title }}</h3>
        <span class="chart-badge" *ngIf="badge">{{ badge }}</span>
      </div>
      <div class="chart-container" [style.height]="height">
        <canvas #chartCanvas></canvas>
      </div>
    </div>
  `,
  styles: [`
    .chart-wrapper {
      background: linear-gradient(135deg, #0f1320 0%, #131929 100%);
      border: 1px solid #1e2535;
      border-radius: 12px;
      padding: 24px;
      transition: all 0.2s ease;
    }

    .chart-wrapper:hover {
      border-color: #2d3a50;
    }

    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .chart-title {
      font-size: 16px;
      font-weight: 600;
      color: #f0f4ff;
      margin: 0;
    }

    .chart-badge {
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 20px;
      background: rgba(110, 231, 247, 0.1);
      color: #6ee7f7;
      font-weight: 500;
    }

    .chart-container {
      position: relative;
      margin-top: 20px;
    }

    @media (max-width: 768px) {
      .chart-wrapper {
        padding: 16px;
      }

      .chart-header {
        margin-bottom: 16px;
      }

      .chart-title {
        font-size: 14px;
      }
    }
  `]
})
export class DashboardChartComponent implements AfterViewInit, OnChanges {
  @Input() title = 'Chart';
  @Input() badge?: string;
  @Input() height = '280px';
  @Input() chartData?: ChartData;
  @Input() chartType: 'line' | 'bar' | 'doughnut' = 'line';

  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  private chart?: Chart;

  ngAfterViewInit(): void {
    this.initChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chartData'] && !changes['chartData'].firstChange && this.chart) {
      this.chart.destroy();
      this.initChart();
    }
  }

  private initChart(): void {
    if (!this.chartCanvas || !this.chartData) return;

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    this.chart = new Chart(ctx, {
      type: this.chartType as any,
      data: this.chartData,
      options: this.getChartOptions() as any
    });
  }

  private getChartOptions(): any {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#64748b',
            font: { size: 12 },
            boxWidth: 6,
            boxHeight: 6,
            padding: 16
          }
        },
        tooltip: {
          backgroundColor: '#1a2640',
          borderColor: '#2d3a50',
          borderWidth: 1,
          titleColor: '#f0f4ff',
          bodyColor: '#c8d3e8',
          padding: 12,
          displayColors: true,
          callbacks: {
            label: (context: any) => {
              let label = context.dataset.label || '';
              if (label) label += ': ';
              if (context.raw !== null) {
                if (context.dataset.yAxisID === 'y') {
                  label += 'R$' + context.raw.toFixed(0);
                } else if (context.dataset.yAxisID === 'y1') {
                  label += context.raw.toFixed(0);
                } else {
                  label += context.raw.toFixed(2);
                }
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#64748b', font: { size: 11 } },
          grid: { color: 'rgba(30, 37, 53, 0.3)' },
          border: { display: false }
        },
        y: {
          ticks: { color: '#64748b', font: { size: 11 } },
          grid: { color: 'rgba(30, 37, 53, 0.3)' },
          border: { display: false }
        },
        y1: {
          position: 'right',
          ticks: { color: '#64748b', font: { size: 11 } },
          grid: { display: false },
          border: { display: false }
        }
      }
    };
  }
}
