/**
 * Modelos de dados compartilhados entre frontend e backend
 */

export enum Role {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  OPERATIONAL = 'OPERATIONAL',
  CLIENT = 'CLIENT',
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  managerId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Manager {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Store {
  id: string;
  name: string;
  managerId: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserStore {
  id: string;
  userId: string;
  storeId: string;
  createdAt: Date;
}

export interface Campaign {
  id: string;
  metaId: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  objective: 'CONVERSIONS' | 'REACH' | 'TRAFFIC' | 'LEADS';
  dailyBudget: number;
  score: number;
  startTime: Date;
  endTime?: Date;
  userId: string;
  storeId?: string | null;
  store?: Store | null;
  createdByUserId?: string | null;
  adAccountId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdAccount {
  id: string;
  metaId?: string;
  metaAccountId?: string;
  name: string;
  accessToken?: string;
  tokenExpiresAt?: Date;
  userId: string;
  storeId?: string | null;
  store?: Store | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MetricDaily {
  id: string;
  campaignId: string;
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpa: number;
  roas: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AggregatedMetrics {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpa: number;
  roas: number;
  score: number;
  totalSpend?: number;
  avgRoas?: number;
  avgCpa?: number;
  avgCtr?: number;
}

export interface DashboardSummary {
  period: {
    days: number;
    from: string;
    to: string;
  };
  scope: {
    storeId: string | null;
  };
  counts: {
    stores: number;
    users: number;
    campaigns: number;
    activeCampaigns: number;
  };
  metrics: AggregatedMetrics & {
    cpc?: number;
  };
  highlights: {
    best: Campaign | null;
    attention: Campaign | null;
    campaigns: Campaign[];
  };
  insights: Insight[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface Insight {
  id: string;
  type: 'alert' | 'warning' | 'opportunity' | 'info';
  severity: 'danger' | 'warning' | 'success' | 'info';
  message: string;
  recommendation: string;
  title?: string;
  description?: string;
  metric?: string;
  current?: number;
  previous?: number;
  change?: number;
}

export interface CampaignInsightReport {
  campaignId: string;
  campaignName: string;
  metrics: AggregatedMetrics;
  insights: Insight[];
  score: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface CreateManagerRequest {
  name: string;
}

export interface UpdateManagerRequest {
  name?: string;
  active?: boolean;
}

export interface CreateStoreRequest {
  name: string;
  managerId?: string;
}

export interface UpdateStoreRequest {
  name?: string;
  managerId?: string;
  active?: boolean;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  role?: Role;
  managerId?: string;
  active?: boolean;
}

export interface ResetUserPasswordRequest {
  password: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
