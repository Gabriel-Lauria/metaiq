import { CampaignAiFailureResponse, CampaignAiStructuredResponse, CampaignCopilotAnalysisResponse, CreateMetaCampaignResponse } from '../../core/models';
import { MetaCallToActionType } from './cta.constants';

export type CampaignObjective = 'OUTCOME_TRAFFIC' | 'OUTCOME_LEADS' | 'REACH';
export type CampaignGender = 'ALL' | 'MALE' | 'FEMALE';
export type CampaignPlacement = 'feed' | 'stories' | 'reels' | 'explore' | 'messenger' | 'audience_network';
export type CampaignInitialStatus = 'PAUSED';
export type CampaignDestinationType = 'site' | 'messages' | 'form' | 'app' | 'catalog';
export type CampaignBudgetType = 'daily' | 'lifetime';
export type CampaignCreationMode = 'ai-entry' | 'ai-result' | 'edit-lite' | 'advanced';
export type CampaignCreationEntryMode = 'manual' | 'ai';
export type CampaignModeSelection = 'AI' | 'GUIDED' | 'ADVANCED';
export type WizardObjectiveId = 'sell-more' | 'receive-messages' | 'drive-site' | 'promote-offer';

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
    state: string;
    stateName: string;
    region: string;
    city: string;
    cityId: number | null;
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
    cta: MetaCallToActionType;
    imageAssetId: string;
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
    utmContent: string;
    utmTerm: string;
    goals: string;
    notes: string;
  };
  ui: {
    simpleObjective: WizardObjectiveId;
    productName: string;
    productDescription: string;
    productDifferential: string;
    productPrice: string;
    modeSelection: CampaignModeSelection;
    aiFlowMode: CampaignCreationMode;
    builderMode: CampaignCreationEntryMode;
    aiBriefing: string;
    aiPrompt: string;
    aiGoal: string;
    aiFunnelStage: 'top' | 'middle' | 'bottom' | 'remarketing' | 'retention' | '';
    aiBudget: number | null;
    aiDurationDays: number | null;
    aiDestinationType: 'whatsapp' | 'website' | 'instagram' | 'leads' | 'messages' | '';
    aiPrimaryOffer: string;
    aiRegion: string;
    aiExtraContext: string;
    aiApplied: boolean;
    aiDetectedFields: string[];
    aiLastSummary: string;
    aiCreativeIdeas: string[];
    aiConfidence: number | null;
    aiStrengths: string[];
    aiAssumptions: string[];
    aiMissingInputs: string[];
    aiRiskWarnings: string[];
    aiRecommendations: string[];
    aiValidationReady: boolean | null;
    aiQualityScore: number | null;
    aiBlockingIssues: string[];
    aiValidationWarnings: string[];
    aiValidationRecommendations: string[];
    aiValidationStale: boolean;
    aiCopilotAnalysis: CampaignCopilotAnalysisResponse | null;
    aiCopilotStale: boolean;
    aiCopilotAppliedImprovementIds: string[];
    aiCopilotIgnoredImprovementIds: string[];
    aiCopilotLastAppliedMessage: string | null;
    aiCopilotApplyError: string | null;
    aiCopilotUndoSnapshot: CampaignBuilderUndoSnapshot | null;
    aiGeoPendingNotice: string | null;
    aiIgnoredFields: string[];
    aiUsedFallback: boolean;
    aiFailure: CampaignAiFailureResponse | null;
    aiCopilotFailure: CampaignAiFailureResponse | null;
    aiLastSuggestion: CampaignAiStructuredResponse | null;
  };
}

export interface CampaignBuilderUndoSnapshot {
  improvementId: string;
  label: string;
  previousState: CampaignBuilderState;
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

/**
 * FASE 7.1: STEP-BY-STEP CAMPAIGN CREATION FLOW
 * 
 * Novo sistema de criação de campanhas com fluxo guiado, inspirado em Meta Ads / Google Ads.
 * 
 * Modo Manual: Configuração → Público → Criativo → Revisão
 * Modo IA:     Briefing IA → Configuração → Público → Criativo → Revisão
 */

export type StepId = 'briefing-ia' | 'configuration' | 'audience' | 'creative' | 'review';

export interface StepValidation {
  /** Erros que bloqueiam o avanço */
  errors: string[];
  /** Avisos que não bloqueiam, mas devem ser considerados */
  warnings: string[];
  /** Se a etapa está completa o suficiente para avançar */
  isComplete: boolean;
}

export interface CampaignBuilderStepState {
  /** Etapa atual no fluxo */
  currentStep: StepId;
  /** Modo de entrada (manual ou IA) */
  entryMode: CampaignCreationEntryMode;
  /** Se está no modo IA ou manual */
  isAiMode: boolean;
  /** Validação da etapa atual */
  currentStepValidation: StepValidation;
  /** Map de validações por etapa */
  stepValidations: Record<StepId, StepValidation>;
  /** Etapas completadas (que podem voltar) */
  completedSteps: StepId[];
  /** Se o usuário já tentou submeter */
  submitAttempted: boolean;
}

export interface StepMetadata {
  id: StepId;
  label: string;
  description: string;
  order: number;
  requiresAiMode?: boolean; // true apenas para 'briefing-ia'
}
