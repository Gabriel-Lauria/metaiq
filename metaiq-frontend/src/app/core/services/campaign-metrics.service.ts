import { Injectable, signal, computed } from '@angular/core';
import {
  BillingItem,
  FinancialMetrics,
  StoreBillingSummary,
  BillingTimeSeries,
  BillingComposition,
  FinancialDashboardData,
  BillingAlert,
  BillingFilters
} from '../models/financial.models';

@Injectable({
  providedIn: 'root'
})
export class FinancialService {
  private billingItems = signal<BillingItem[]>([]);
  private filters = signal<BillingFilters>({ period: 30 });

  // Mock data for demonstration
  private mockBillingItems: BillingItem[] = [
    {
      id: '1',
      storeName: 'Loja Centro',
      storeId: 'store-1',
      cnpj: '12.345.678/0001-90',
      nfsNumber: 1001,
      date: '2026-04-15',
      amount: 25000.00,
      baseAmount: 22000.00,
      extraAmount: 2000.00,
      adjustmentAmount: 1000.00,
      finalAmount: 25000.00,
      status: 'PAGO',
      dueDate: '2026-04-20',
      paymentDate: '2026-04-16',
      category: 'Vendas'
    },
    {
      id: '2',
      storeName: 'Loja Shopping',
      storeId: 'store-2',
      cnpj: '23.456.789/0001-80',
      nfsNumber: 1002,
      date: '2026-04-14',
      amount: 18500.00,
      baseAmount: 17000.00,
      extraAmount: 1000.00,
      adjustmentAmount: 500.00,
      finalAmount: 18500.00,
      status: 'FATURADO',
      dueDate: '2026-04-19',
      category: 'Serviços'
    },
    {
      id: '3',
      storeName: 'Loja Online',
      storeId: 'store-3',
      cnpj: '34.567.890/0001-70',
      nfsNumber: 1003,
      date: '2026-04-13',
      amount: 32000.00,
      baseAmount: 28000.00,
      extraAmount: 3000.00,
      adjustmentAmount: 1000.00,
      finalAmount: 32000.00,
      status: 'PENDENTE',
      dueDate: '2026-04-18',
      category: 'E-commerce'
    },
    {
      id: '4',
      storeName: 'Loja Premium',
      storeId: 'store-4',
      cnpj: '45.678.901/0001-60',
      nfsNumber: 1004,
      date: '2026-04-12',
      amount: 41000.00,
      baseAmount: 38000.00,
      extraAmount: 2000.00,
      adjustmentAmount: 1000.00,
      finalAmount: 41000.00,
      status: 'PAGO',
      dueDate: '2026-04-17',
      paymentDate: '2026-04-13',
      category: 'Luxo'
    },
    {
      id: '5',
      storeName: 'Loja Outlet',
      storeId: 'store-5',
      cnpj: '56.789.012/0001-50',
      nfsNumber: 1005,
      date: '2026-04-11',
      amount: 12800.00,
      baseAmount: 12000.00,
      extraAmount: 500.00,
      adjustmentAmount: 300.00,
      finalAmount: 12800.00,
      status: 'FATURADO',
      dueDate: '2026-04-16',
      category: 'Descontos'
    }
  ];

  constructor() {
    // Initialize with mock data
    this.billingItems.set(this.mockBillingItems);
  }

  // Computed signals for filtered data
  filteredItems = computed(() => {
    const items = this.billingItems();
    const filters = this.filters();

    return items.filter(item => {
      if (filters.storeId && item.storeId !== filters.storeId) return false;
      if (filters.status && item.status !== filters.status) return false;
      if (filters.minAmount && item.finalAmount < filters.minAmount) return false;
      if (filters.maxAmount && item.finalAmount > filters.maxAmount) return false;
      if (filters.category && item.category !== filters.category) return false;
      return true;
    });
  });

  // Financial metrics computation
  metrics = computed((): FinancialMetrics => {
    const items = this.filteredItems();
    const totalBilled = items.reduce((sum, item) => sum + item.finalAmount, 0);
    const paidItems = items.filter(item => item.status === 'PAGO');
    const pendingItems = items.filter(item => item.status === 'PENDENTE');
    const billedItems = items.filter(item => item.status === 'FATURADO');

    const totalPaid = paidItems.reduce((sum, item) => sum + item.finalAmount, 0);
    const totalPending = pendingItems.reduce((sum, item) => sum + item.finalAmount, 0);

    const stores = [...new Set(items.map(item => item.storeId))];
    const paidStores = [...new Set(paidItems.map(item => item.storeId))];
    const pendingStores = [...new Set(pendingItems.map(item => item.storeId))];
    const billedStores = [...new Set(billedItems.map(item => item.storeId))];

    const averageTicket = items.length > 0 ? totalBilled / items.length : 0;
    const amounts = items.map(item => item.finalAmount);
    const highestBilling = amounts.length > 0 ? Math.max(...amounts) : 0;
    const lowestBilling = amounts.length > 0 ? Math.min(...amounts) : 0;
    const averagePerStore = stores.length > 0 ? totalBilled / stores.length : 0;

    // Placeholder marketing metrics for dashboard compatibility
    const impressions = 0;
    const clicks = 0;
    const ctr = 0;
    const spend = 0;
    const cpc = 0;
    const conversions = paidItems.length;
    const cpa = conversions > 0 ? spend / conversions : 0;
    const roas = 0;

    // Mock growth calculation
    const growthPercentage = 12.5;

    return {
      totalBilled,
      totalPaid,
      totalPending,
      storesCount: stores.length,
      billedStoresCount: billedStores.length,
      paidStoresCount: paidStores.length,
      pendingStoresCount: pendingStores.length,
      averageTicket,
      highestBilling,
      lowestBilling,
      averagePerStore,
      nfsCount: items.length,
      growthPercentage,
      impressions,
      clicks,
      ctr,
      spend,
      cpc,
      conversions,
      cpa,
      roas,
      periodComparison: {
        current: totalBilled,
        previous: totalBilled * 0.9, // Mock previous period
        change: growthPercentage
      }
    };
  });

  // Store summaries
  storeSummaries = computed((): StoreBillingSummary[] => {
    const items = this.filteredItems();
    const storeMap = new Map<string, BillingItem[]>();

    items.forEach(item => {
      if (!storeMap.has(item.storeId)) {
        storeMap.set(item.storeId, []);
      }
      storeMap.get(item.storeId)!.push(item);
    });

    const totalBilled = items.reduce((sum, item) => sum + item.finalAmount, 0);

    return Array.from(storeMap.entries()).map(([storeId, storeItems]) => {
      const storeTotal = storeItems.reduce((sum, item) => sum + item.finalAmount, 0);
      const paidTotal = storeItems.filter(item => item.status === 'PAGO').reduce((sum, item) => sum + item.finalAmount, 0);
      const pendingTotal = storeItems.filter(item => item.status === 'PENDENTE').reduce((sum, item) => sum + item.finalAmount, 0);

      const statusCounts = storeItems.reduce((counts, item) => {
        counts[item.status] = (counts[item.status] || 0) + 1;
        return counts;
      }, {} as Record<string, number>);

      let status: 'PENDENTE' | 'FATURADO' | 'PAGO' | 'MISTO' = 'MISTO';
      if (statusCounts['PENDENTE'] === storeItems.length) status = 'PENDENTE';
      else if (statusCounts['FATURADO'] === storeItems.length) status = 'FATURADO';
      else if (statusCounts['PAGO'] === storeItems.length) status = 'PAGO';

      const lastBillingDate = storeItems
        .map(item => item.date)
        .sort()
        .reverse()[0];

      return {
        storeId,
        storeName: storeItems[0].storeName,
        totalBilled: storeTotal,
        totalPaid: paidTotal,
        totalPending: pendingTotal,
        nfsCount: storeItems.length,
        lastBillingDate,
        status,
        percentage: totalBilled > 0 ? (storeTotal / totalBilled) * 100 : 0
      };
    }).sort((a, b) => b.totalBilled - a.totalBilled);
  });

  // Time series data
  timeSeries = computed((): BillingTimeSeries[] => {
    const items = this.filteredItems();
    const dateMap = new Map<string, { billed: number; paid: number; pending: number }>();

    items.forEach(item => {
      if (!dateMap.has(item.date)) {
        dateMap.set(item.date, { billed: 0, paid: 0, pending: 0 });
      }
      const data = dateMap.get(item.date)!;
      data.billed += item.finalAmount;
      if (item.status === 'PAGO') data.paid += item.finalAmount;
      else if (item.status === 'PENDENTE') data.pending += item.finalAmount;
    });

    return Array.from(dateMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  });

  // Billing composition
  composition = computed((): BillingComposition => {
    const items = this.filteredItems();
    return items.reduce((comp, item) => ({
      baseAmount: comp.baseAmount + item.baseAmount,
      extraAmount: comp.extraAmount + item.extraAmount,
      adjustmentAmount: comp.adjustmentAmount + item.adjustmentAmount,
      finalAmount: comp.finalAmount + item.finalAmount
    }), { baseAmount: 0, extraAmount: 0, adjustmentAmount: 0, finalAmount: 0 });
  });

  // Alerts and insights
  alerts = computed((): BillingAlert[] => {
    const metrics = this.metrics();
    const alerts: BillingAlert[] = [];

    if (metrics.pendingStoresCount > 0) {
      alerts.push({
        id: 'pending-alert',
        type: 'warning',
        title: 'Faturamento Pendente',
        message: `${metrics.pendingStoresCount} loja(s) com faturamento pendente`,
        amount: metrics.totalPending
      });
    }

    const lowPerformingStores = this.storeSummaries().filter(s => s.percentage < 5);
    if (lowPerformingStores.length > 0) {
      alerts.push({
        id: 'low-performance',
        type: 'info',
        title: 'Baixo Desempenho',
        message: `${lowPerformingStores.length} loja(s) com participação abaixo de 5%`
      });
    }

    if (metrics.growthPercentage < 0) {
      alerts.push({
        id: 'negative-growth',
        type: 'error',
        title: 'Queda no Faturamento',
        message: `Redução de ${Math.abs(metrics.growthPercentage)}% em relação ao período anterior`
      });
    }

    return alerts;
  });

  // Kanban items for the board
  kanbanItems = computed(() => this.filteredItems());

  // Main dashboard data
  dashboardData = computed((): FinancialDashboardData => {
    const filters = this.filters();
    const period = filters.period;
    const now = new Date();
    let from = new Date();
    let to = new Date();
    let days = 30;
    let label = 'Últimos 30 dias';

    if (period === 'thisMonth') {
      const today = new Date();
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      to = today;
      days = today.getDate();
      label = 'Este mês';
    } else if (period === -1 && filters.fromDate && filters.toDate) {
      from = new Date(filters.fromDate);
      to = new Date(filters.toDate);
      days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
      label = `${days} dias`;
    } else {
      days = typeof period === 'number' ? period : 30;
      from.setDate(from.getDate() - days);
      label = `${days} dias`;
    }

    return {
      period: {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
        days,
        label
      },
      metrics: this.metrics(),
      storeSummaries: this.storeSummaries(),
      timeSeries: this.timeSeries(),
      composition: this.composition(),
      alerts: this.alerts(),
      kanbanItems: this.kanbanItems()
    };
  });

  // Methods
  setFilters(filters: Partial<BillingFilters>) {
    this.filters.update(current => ({ ...current, ...filters }));
  }

  getFilters() {
    return this.filters();
  }

  // Utility methods for formatting
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
  }
}