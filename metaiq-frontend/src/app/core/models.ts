import { type MetaCallToActionType } from './meta-cta';

/**
 * Modelos de dados compartilhados entre frontend e backend
 */

export enum Role {
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  OPERATIONAL = 'OPERATIONAL',
  CLIENT = 'CLIENT',
}

export type AccountType = 'AGENCY' | 'INDIVIDUAL';

export enum IntegrationProvider {
  META = 'META',
}

export enum IntegrationStatus {
  NOT_CONNECTED = 'NOT_CONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  EXPIRED = 'EXPIRED',
  ERROR = 'ERROR',
}

export enum SyncStatus {
  NEVER_SYNCED = 'NEVER_SYNCED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  managerId?: string | null;
  tenantId?: string | null;
  accountType?: AccountType | null;
  storeId?: string | null;
  businessName?: string | null;
  businessSegment?: string | null;
  defaultCity?: string | null;
  defaultState?: string | null;
  website?: string | null;
  instagram?: string | null;
  whatsapp?: string | null;
  active?: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyProfile {
  businessName: string;
  businessSegment: string;
  city: string;
  state: string;
  website: string;
  instagram: string;
  whatsapp: string;
}

export interface CompanyProfilePayload {
  businessName: string;
  businessSegment: string;
  defaultCity: string;
  defaultState: string;
  website: string;
  instagram: string;
  whatsapp: string;
}

export interface Manager {
  id: string;
  name: string;
  cnpj?: string | null;
  phone?: string | null;
  email?: string | null;
  contactName?: string | null;
  notes?: string | null;
  active: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Store {
  id: string;
  name: string;
  managerId: string;
  tenantId: string;
  active: boolean;
  deletedAt?: Date | null;
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
  objective: 'CONVERSIONS' | 'REACH' | 'TRAFFIC' | 'LEADS' | null;
  dailyBudget: number | null;
  score: number;
  startTime: Date | null;
  endTime?: Date | null;
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
  provider?: IntegrationProvider;
  externalId?: string | null;
  syncStatus?: SyncStatus;
  importedAt?: Date | null;
  lastSeenAt?: Date | null;
  name: string;
  accessToken?: string;
  tokenExpiresAt?: Date;
  active?: boolean;
  userId: string;
  storeId?: string | null;
  store?: Store | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreIntegration {
  id: string;
  storeId: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  externalBusinessId?: string | null;
  externalAdAccountId?: string | null;
  tokenType?: string | null;
  tokenExpiresAt?: Date | null;
  grantedScopes?: string[];
  providerUserId?: string | null;
  pageId?: string | null;
  pageName?: string | null;
  oauthConnectedAt?: Date | null;
  lastSyncAt?: Date | null;
  lastSyncStatus: SyncStatus;
  lastSyncError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MetaOAuthStartResponse {
  authorizationUrl: string;
  expiresAt: Date;
}

export interface MetaAdAccount {
  externalId: string;
  name: string;
  status: 'ACTIVE' | 'DISABLED' | 'UNSETTLED' | 'UNKNOWN';
}

export interface MetaPage {
  id: string;
  name: string;
  category?: string | null;
}

export interface IbgeState {
  code: string;
  name: string;
  ibgeId: number;
}

export interface IbgeCity {
  id: number;
  name: string;
}

export interface UpdateMetaPageRequest {
  pageId: string;
  pageName?: string;
}

export interface CreateMetaCampaignRequest {
  name: string;
  objective: string;
  dailyBudget: number;
  country: string;
  adAccountId: string;
  message: string;
  imageUrl: string;
  state?: string;
  stateName?: string;
  city?: string;
  cityId?: number;
  destinationUrl?: string;
  headline?: string;
  description?: string;
  cta?: MetaCallToActionType;
  initialStatus?: 'PAUSED' | 'ACTIVE';
}

export type MetaCampaignExecutionStep = 'campaign' | 'adset' | 'creative' | 'ad' | 'persist';
export type MetaCampaignExecutionStatus = 'PARTIAL' | 'FAILED' | 'IN_PROGRESS' | 'COMPLETED';

export interface MetaCampaignPartialIds {
  campaignId?: string;
  adSetId?: string;
  creativeId?: string;
  adId?: string;
}

export interface MetaCampaignRecoveryPartialIds {
  campaign?: string | null;
  adset?: string | null;
  creative?: string | null;
  ad?: string | null;
}

export interface MetaCampaignErrorDetails {
  message?: string;
  code?: string | number;
  subcode?: string | number;
  userTitle?: string;
  userMessage?: string;
}

export interface MetaCampaignExecutionContext {
  step?: MetaCampaignExecutionStep;
  executionId?: string;
  executionStatus?: MetaCampaignExecutionStatus;
  partialIds?: MetaCampaignPartialIds;
  hint?: string;
  metaError?: MetaCampaignErrorDetails;
}

export interface CreateMetaCampaignResponse {
  executionId?: string;
  idempotencyKey?: string;
  campaignId: string;
  adSetId: string;
  creativeId: string;
  adId: string;
  status: 'CREATED';
  executionStatus?: 'COMPLETED';
  initialStatus?: 'PAUSED' | 'ACTIVE';
  storeId: string;
  adAccountId: string;
  platform: 'META';
  step?: MetaCampaignExecutionStep;
  partialIds?: MetaCampaignPartialIds;
  hint?: string;
}

export interface MetaCampaignCreationError extends MetaCampaignExecutionContext {
  message: string;
}

export interface MetaCampaignRecoveryStatusResponse {
  id: string;
  status: MetaCampaignExecutionStatus;
  step?: MetaCampaignExecutionStep;
  message?: string;
  partialIds?: MetaCampaignRecoveryPartialIds;
}

export interface MetaCampaignRecoveryResponse extends MetaCampaignExecutionContext {
  success: boolean;
  message: string;
  ids?: MetaCampaignPartialIds;
}

export interface UpdateCampaignRequest {
  name?: string;
  status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  objective?: 'CONVERSIONS' | 'REACH' | 'TRAFFIC' | 'LEADS';
  dailyBudget?: number;
  endTime?: string;
  storeId?: string;
  adAccountId?: string;
}

export type AiFunnelStage = 'top' | 'middle' | 'bottom';
export type AiGender = 'all' | 'male' | 'female';
export type AiBudgetType = 'daily' | 'lifetime';
export type AiCampaignObjective = 'OUTCOME_TRAFFIC' | 'OUTCOME_LEADS' | 'REACH';
export type AiPlacement = 'feed' | 'stories' | 'reels' | 'explore' | 'messenger' | 'audience_network';

export interface AiPlannerOutput {
  businessType: string | null;
  goal: string | null;
  funnelStage: AiFunnelStage | null;
  offer: string | null;
  audienceIntent: string | null;
  missingInputs: string[];
  assumptions: string[];
}

export interface AiCampaignBudgetOutput {
  type: AiBudgetType | null;
  amount: number | null;
  currency: 'BRL';
}

export interface AiCampaignOutput {
  campaignName: string | null;
  objective: AiCampaignObjective | null;
  buyingType: 'AUCTION';
  status: 'PAUSED';
  budget: AiCampaignBudgetOutput;
}

export interface AiTargetingOutput {
  country: string | null;
  state: string | null;
  stateCode: string | null;
  city: string | null;
  ageMin: number | null;
  ageMax: number | null;
  gender: AiGender | null;
  interests: string[];
  excludedInterests: string[];
  placements: AiPlacement[];
}

export interface AiAdSetOutput {
  name: string | null;
  optimizationGoal: string | null;
  billingEvent: string | null;
  targeting: AiTargetingOutput;
}

export interface AiCreativeOutput {
  name: string | null;
  primaryText: string | null;
  headline: string | null;
  description: string | null;
  cta: MetaCallToActionType | null;
  imageSuggestion: string | null;
  destinationUrl: string | null;
}

export interface AiReviewOutput {
  summary: string;
  strengths: string[];
  risks: string[];
  recommendations: string[];
  confidence: number;
}

export interface AiValidationOutput {
  isReadyToPublish: boolean;
  qualityScore: number;
  blockingIssues: string[];
  warnings: string[];
  recommendations: string[];
}

export interface CampaignAiStructuredResponse {
  planner: AiPlannerOutput;
  campaign: AiCampaignOutput;
  adSet: AiAdSetOutput;
  creative: AiCreativeOutput;
  review: AiReviewOutput;
  validation: AiValidationOutput;
  meta: {
    promptVersion: string;
    model: string;
    usedFallback: boolean;
    responseValid: boolean;
  };
}

export interface AiCampaignCopilotAnalysis {
  summary: string;
  strengths: string[];
  issues: string[];
  improvements: AiCampaignCopilotImprovement[];
  confidence: number;
}

export type AiCampaignCopilotImprovementType =
  | 'headline'
  | 'primaryText'
  | 'targeting'
  | 'cta'
  | 'budget'
  | 'url';

export interface AiCampaignCopilotImprovement {
  id: string;
  type: AiCampaignCopilotImprovementType;
  label: string;
  description: string;
  suggestedValue: string | number | Record<string, unknown>;
  confidence: number;
}

export interface CampaignCopilotAnalysisResponse {
  analysis: AiCampaignCopilotAnalysis;
  meta: {
    promptVersion: string;
    model: string;
    usedFallback: boolean;
    responseValid: boolean;
  };
}

export interface CampaignCopilotAnalysisRequest {
  storeId: string;
  campaign: Record<string, unknown>;
  adSet?: Record<string, unknown>;
  creative?: Record<string, unknown>;
  targeting?: Record<string, unknown>;
  budget?: Record<string, unknown>;
  location?: Record<string, unknown>;
  objective?: string;
  cta?: MetaCallToActionType;
  destinationUrl?: string;
}

export interface CampaignAiRequest {
  prompt: string;
  storeId: string;
  goal?: string;
  funnelStage?: 'top' | 'middle' | 'bottom' | 'remarketing' | 'retention';
  budget?: number;
  durationDays?: number;
  primaryOffer?: string;
  destinationType?: 'whatsapp' | 'website' | 'instagram' | 'leads' | 'messages';
  region?: string;
  extraContext?: string;
}

export type CampaignSuggestionRequest = CampaignAiRequest;
export type CampaignSuggestionResponse = CampaignAiStructuredResponse;

export interface ConnectMetaIntegrationRequest {
  externalBusinessId?: string;
  externalAdAccountId?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateMetaIntegrationStatusRequest {
  status: IntegrationStatus;
  lastSyncStatus?: SyncStatus;
  lastSyncError?: string | null;
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
  refreshToken?: string;
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
  accountType?: AccountType;
  businessName: string;
  businessSegment?: string;
  defaultCity: string;
  defaultState: string;
  website?: string;
  instagram?: string;
  whatsapp?: string;
}

export interface CreateManagerRequest {
  name: string;
  cnpj?: string | null;
  phone?: string | null;
  email?: string | null;
  contactName?: string | null;
  notes?: string | null;
}

export interface UpdateManagerRequest {
  name?: string;
  active?: boolean;
  cnpj?: string | null;
  phone?: string | null;
  email?: string | null;
  contactName?: string | null;
  notes?: string | null;
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
