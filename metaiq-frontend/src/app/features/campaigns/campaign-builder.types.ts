import { CreateMetaCampaignResponse } from '../../core/models';

export type CampaignObjective = 'OUTCOME_TRAFFIC' | 'OUTCOME_LEADS' | 'REACH';
export type CampaignGender = 'ALL' | 'MALE' | 'FEMALE';
export type CampaignPlacement = 'feed' | 'stories' | 'reels' | 'explore' | 'messenger' | 'audience_network';
export type CampaignInitialStatus = 'PAUSED' | 'ACTIVE';
export type CampaignDestinationType = 'site' | 'messages' | 'form' | 'app' | 'catalog';
export type CampaignBudgetType = 'daily' | 'lifetime';

export interface CampaignBuilderState {
  campaign: {
    name: string;
    objective: CampaignObjective;
    initialStatus: CampaignInitialStatus;
    specialCategory: string;
    buyingType: string;
    abTest: boolean;
    campaignBudgetOptimization: boolean;
    campaignSpendLimit: number | null;
  };
  identity: {
    adAccountId: string;
    facebookPageId: string;
    instagramAccount: string;
    displayName: string;
    timezone: string;
    currency: string;
  };
  audience: {
    autoAudience: boolean;
    country: string;
    region: string;
    city: string;
    zipCode: string;
    radiusKm: number;
    presenceType: string;
    ageMin: number;
    ageMax: number;
    gender: CampaignGender;
    languagePrimary: string;
    languagesAdditional: string;
    interests: string;
    behaviors: string;
    demographics: string;
    excludedInterests: string;
    savedAudience: string;
    customAudience: string;
    lookalikeAudience: string;
    excludedAudiences: string;
  };
  budget: {
    budgetType: CampaignBudgetType;
    value: number;
    quickBudget: number | null;
    adSetSpendLimit: number | null;
    bidStrategy: string;
    costControl: number | null;
    minRoas: number | null;
    costPerResultGoal: number | null;
    manualBid: number | null;
    billingEvent: string;
    optimizationGoal: string;
    conversionWindow: string;
  };
  schedule: {
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    weekDays: string[];
    timeBlocks: string;
    advancedScheduling: boolean;
  };
  placements: {
    selected: CampaignPlacement[];
    platforms: {
      facebook: boolean;
      instagram: boolean;
      messenger: boolean;
      audienceNetwork: boolean;
    };
  };
  destination: {
    type: CampaignDestinationType;
    websiteUrl: string;
    messagesDestination: string;
    formName: string;
    appLink: string;
    catalogId: string;
  };
  creative: {
    message: string;
    headline: string;
    description: string;
    cta: string;
    imageUrl: string;
    carousel: boolean;
  };
  tracking: {
    pixel: string;
    mainEvent: string;
    conversionTracking: string;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    goals: string;
    notes: string;
  };
  ui: {
    aiPrompt: string;
    aiApplied: boolean;
    aiDetectedFields: string[];
    aiLastSummary: string;
  };
}

export interface CreationReadinessItem {
  id: string;
  label: string;
  done: boolean;
}

export interface SectionProgress {
  id: string;
  label: string;
  done: boolean;
}

export interface SummaryRow {
  label: string;
  value: string;
}

export interface ReviewSignal {
  id: string;
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info';
}

export interface SuccessOverlayState {
  name: string;
  response: CreateMetaCampaignResponse;
}

export interface PromptExtractionResult {
  detectedFields: string[];
  summary: string;
}

export interface CampaignCreateSuccessEvent {
  name: string;
  storeName: string;
  response: CreateMetaCampaignResponse;
}
