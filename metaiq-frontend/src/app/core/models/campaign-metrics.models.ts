/**
 * Models for campaign performance analytics
 */

export interface CampaignMetricsItem {
  id: string;
  campaignName: string;
  campaignId: string;
  accountName: string;
  accountId: string;
  storeName: string;
  storeId: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  cpa: number;
  roas: number;
  revenue: number;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  objective: string;
  budget: number;
  remainingBudget: number;
}

export interface CampaignPerformanceMetrics {
  totalSpend: number;
  totalRevenue: number;
  totalConversions: number;
  totalImpressions: number;
  totalClicks: number;
  averageCtr: number;
  averageCpc: number;
  averageCpa: number;
  averageRoas: number;
  campaignsCount: number;
  activeCampaignsCount: number;
  pausedCampaignsCount: number;
  archivedCampaignsCount: number;
  topPerformingCampaign: string;
  lowestPerformingCampaign: string;
  bestRoas: number;
  worstRoas: number;
  periodComparison: {
    current: number;
    previous: number;
    change: number;
  };
}

export interface AccountPerformanceSummary {
  accountId: string;
  accountName: string;
  totalSpend: number;
  totalRevenue: number;
  totalConversions: number;
  campaignsCount: number;
  averageRoas: number;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  percentage: number;
}

export interface CampaignRankingItem {
  label: string;
  detail: string;
  value: string;
  metric: 'spend' | 'roas' | 'conversions' | 'ctr';
}

export interface CampaignTimeSeries {
  date: string;
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
}

export interface CampaignSpendComposition {
  byObjective: { [objective: string]: number };
  byAccount: { [accountId: string]: number };
  byStore: { [storeId: string]: number };
}

export interface CampaignAnalyticsData {
  period: {
    from: string;
    to: string;
    days: number;
    label: string;
  };
  metrics: CampaignPerformanceMetrics;
  accountSummaries: AccountPerformanceSummary[];
  timeSeries: CampaignTimeSeries[];
  composition: CampaignSpendComposition;
  alerts: CampaignAlert[];
  campaignItems: CampaignMetricsItem[];
}

export interface CampaignAlert {
  id: string;
  type: 'warning' | 'error' | 'info' | 'success';
  title: string;
  message: string;
  campaignName?: string;
  accountName?: string;
  amount?: number;
  metric?: string;
}

export interface CampaignFilters {
  period: number | 'thisMonth' | -1;
  fromDate?: string;
  toDate?: string;
  storeId?: string;
  accountId?: string;
  campaignId?: string;
  status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  objective?: string;
  minSpend?: number;
  maxSpend?: number;
  minRoas?: number;
  maxRoas?: number;
}