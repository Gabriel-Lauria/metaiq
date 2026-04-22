import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration, ChartData, ChartType, registerables } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

Chart.register(...registerables);

@Component({
  selector: 'app-chart',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  template: `
    <div class="chart-container" *ngIf="hasRenderableData(); else emptyChart">
      <canvas
        baseChart
        [data]="chartData"
        [options]="chartOptions"
        [type]="chartType">
      </canvas>
    </div>

    <ng-template #emptyChart>
      <div class="chart-empty">Sem dados suficientes para renderizar o gráfico.</div>
    </ng-template>
  `,
  styles: [`
    .chart-container {
      position: relative;
      height: 300px;
      width: 100%;
    }

    .chart-empty {
      display: grid;
      place-items: center;
      min-height: 300px;
      border: 1px dashed var(--border);
      border-radius: 8px;
      background: var(--bg-surface-soft);
      color: var(--text-soft);
      font-size: 14px;
      font-weight: 700;
      text-align: center;
      padding: 24px;
    }
  `]
})
export class ChartComponent implements OnChanges {
  @Input() chartType: ChartType = 'bar';
  @Input() chartData!: ChartData;
  @Input() chartOptions: ChartConfiguration['options'] = {};

  ngOnChanges(changes: SimpleChanges) {
    if (changes['chartOptions'] && this.chartOptions) {
      // Ensure responsive is set
      this.chartOptions.responsive = true;
      this.chartOptions.maintainAspectRatio = false;
    }
  }

  hasRenderableData(): boolean {
    return Boolean(
      this.chartData?.datasets?.some((dataset) =>
        Array.isArray(dataset.data) && dataset.data.some((value) => Number(value) > 0),
      ),
    );
  }
}
