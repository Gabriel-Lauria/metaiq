/**
 * Modelos para o dashboard financeiro
 */

export interface BillingItem {
  id: string;
  storeName: string;
  storeId: string;
  cnpj?: string;
  nfsNumber: number;
  date: string;
  amount: number;
  baseAmount: number;
  extraAmount: number;
  adjustmentAmount: number;
  finalAmount: number;
  status: 'PENDENTE' | 'FATURADO' | 'PAGO';
  dueDate?: string;
  paymentDate?: string;
  notes?: string;
  category?: string;
}

export interface FinancialMetrics {
  totalBilled: number;
  totalPaid: number;
  totalPending: number;
  storesCount: number;
  billedStoresCount: number;
  paidStoresCount: number;
  pendingStoresCount: number;
  averageTicket: number;
  highestBilling: number;
  lowestBilling: number;
  averagePerStore: number;
  nfsCount: number;
  growthPercentage: number;
  periodComparison: {
    current: number;
    previous: number;
    change: number;
  };
}

export interface StoreBillingSummary {
  storeId: string;
  storeName: string;
  totalBilled: number;
  totalPaid: number;
  totalPending: number;
  nfsCount: number;
  lastBillingDate?: string;
  status: 'PENDENTE' | 'FATURADO' | 'PAGO' | 'MISTO';
  percentage: number;
}

export interface BillingTimeSeries {
  date: string;
  billed: number;
  paid: number;
  pending: number;
}

export interface BillingComposition {
  baseAmount: number;
  extraAmount: number;
  adjustmentAmount: number;
  finalAmount: number;
}

export interface FinancialDashboardData {
  period: {
    from: string;
    to: string;
    days: number;
  };
  metrics: FinancialMetrics;
  storeSummaries: StoreBillingSummary[];
  timeSeries: BillingTimeSeries[];
  composition: BillingComposition;
  alerts: BillingAlert[];
  kanbanItems: BillingItem[];
}

export interface BillingAlert {
  id: string;
  type: 'warning' | 'error' | 'info' | 'success';
  title: string;
  message: string;
  storeName?: string;
  amount?: number;
}

export interface BillingFilters {
  period: number;
  storeId?: string;
  status?: 'PENDENTE' | 'FATURADO' | 'PAGO';
  minAmount?: number;
  maxAmount?: number;
  category?: string;
}