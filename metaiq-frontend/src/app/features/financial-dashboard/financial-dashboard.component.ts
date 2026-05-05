import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChartData, ChartType } from 'chart.js';
import { FinancialService } from '../../core/services/financial.service';
import { BillingItem, BillingFilters } from '../../core/models/financial.models';
import { ChartComponent } from '../../core/components/chart.component';
import { KanbanBoardComponent } from '../../core/components/kanban-board.component';

@Component({
  selector: 'app-financial-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ChartComponent,
    KanbanBoardComponent
  ],
  templateUrl: './financial-dashboard.component.html',
  styleUrls: ['./financial-dashboard.component.scss']
})
export class FinancialDashboardComponent implements OnInit {
  private financialService = inject(FinancialService);

  // Reactive state
  filters = signal<BillingFilters>({ period: 30 });
  selectedView = signal<'overview' | 'kanban' | 'charts' | 'table'>('overview');

  // Computed data
  dashboardData = computed(() => this.financialService.dashboardData());
  metrics = computed(() => this.dashboardData().metrics);
  storeSummaries = computed(() => this.dashboardData().storeSummaries);
  alerts = computed(() => this.dashboardData().alerts);
  kanbanItems = computed(() => this.dashboardData().kanbanItems);

  // Chart data
  revenueByStoreChart = computed((): ChartData => {
    const summaries = this.storeSummaries();
    return {
      labels: summaries.map(s => s.storeName),
      datasets: [{
        label: 'Faturamento por Loja',
        data: summaries.map(s => s.totalBilled),
        backgroundColor: [
          '#007bff', '#28a745', '#ffc107', '#dc3545', '#6f42c1',
          '#2563eb', '#f97316', '#16a34a', '#64748b', '#0ea5e9'
        ],
        borderWidth: 1
      }]
    };
  });

  revenueTrendChart = computed((): ChartData => {
    const timeSeries = this.dashboardData().timeSeries;
    return {
      labels: timeSeries.map(t => new Date(t.date).toLocaleDateString('pt-BR')),
      datasets: [
        {
          label: 'Faturado',
          data: timeSeries.map(t => t.billed),
          borderColor: '#28a745',
          backgroundColor: 'rgba(40, 167, 69, 0.1)',
          fill: true
        },
        {
          label: 'Pago',
          data: timeSeries.map(t => t.paid),
          borderColor: '#007bff',
          backgroundColor: 'rgba(0, 123, 255, 0.1)',
          fill: true
        }
      ]
    };
  });

  compositionChart = computed((): ChartData => {
    const composition = this.dashboardData().composition;
    return {
      labels: ['Valor Base', 'Extras', 'Ajustes'],
      datasets: [{
        data: [
          composition.baseAmount,
          composition.extraAmount,
          composition.adjustmentAmount
        ],
        backgroundColor: ['#28a745', '#ffc107', '#dc3545'],
        hoverBackgroundColor: ['#218838', '#e0a800', '#c82333']
      }]
    };
  });

  statusChart = computed((): ChartData => {
    const metrics = this.metrics();
    return {
      labels: ['Pago', 'Faturado', 'Pendente'],
      datasets: [{
        data: [
          metrics.totalPaid,
          metrics.totalBilled - metrics.totalPaid - metrics.totalPending,
          metrics.totalPending
        ],
        backgroundColor: ['#28a745', '#007bff', '#ffc107'],
        hoverBackgroundColor: ['#218838', '#0056b3', '#e0a800']
      }]
    };
  });

  // Chart options
  barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => this.formatCurrency(context.parsed.y)
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: any) => this.formatCurrency(value)
        }
      }
    }
  };

  lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        callbacks: {
          label: (context: any) => this.formatCurrency(context.parsed.y)
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: any) => this.formatCurrency(value)
        }
      }
    }
  };

  pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
            const percentage = ((context.parsed / total) * 100).toFixed(1);
            return `${context.label}: ${this.formatCurrency(context.parsed)} (${percentage}%)`;
          }
        }
      }
    }
  };

  doughnutChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
            const percentage = ((context.parsed / total) * 100).toFixed(1);
            return `${context.label}: ${this.formatCurrency(context.parsed)} (${percentage}%)`;
          }
        }
      }
    }
  };

  ngOnInit() {
    // Initialize data
    this.updateFilters({ period: 30 });
  }

  updateFilters(newFilters: Partial<BillingFilters>) {
    this.filters.update(current => ({ ...current, ...newFilters }));
    this.financialService.setFilters(this.filters());
  }

  setView(view: 'overview' | 'kanban' | 'charts' | 'table') {
    this.selectedView.set(view);
  }

  onKanbanItemMoved(event: {item: BillingItem, newStatus: string}) {
    // In a real app, this would update the backend
  }

  onKanbanCardClicked(item: BillingItem) {
    // In a real app, this would open a detail modal
  }

  // Utility methods
  formatCurrency(value: number): string {
    return this.financialService.formatCurrency(value);
  }

  formatPercent(value: number): string {
    return this.financialService.formatPercent(value);
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'PAGO': return 'success';
      case 'FATURADO': return 'info';
      case 'PENDENTE': return 'warning';
      default: return 'secondary';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'PAGO': return '✓';
      case 'FATURADO': return '📄';
      case 'PENDENTE': return '⏳';
      default: return '•';
    }
  }
}
