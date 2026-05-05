import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CampaignAiSuggestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  prompt: string;
}

export class CampaignSuggestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  prompt: string;

  @IsString()
  @IsNotEmpty()
  @IsUUID()
  storeId: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  goal?: string;

  @IsOptional()
  @IsIn(['top', 'middle', 'bottom', 'remarketing', 'retention'])
  funnelStage?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  budget?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(365)
  durationDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  primaryOffer?: string;

  @IsOptional()
  @IsIn(['whatsapp', 'website', 'instagram', 'leads', 'messages'])
  destinationType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  extraContext?: string;
}

export class CampaignAnalysisDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  storeId: string;

  @IsObject()
  campaign: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  adSet?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  creative?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  targeting?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  budget?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  location?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  destinationUrl?: string;
}

export type AiFunnelStage = 'top' | 'middle' | 'bottom';
export type AiGenderOutput = 'all' | 'male' | 'female';
export type AiBudgetType = 'daily' | 'lifetime';
export type AiCampaignObjective = 'OUTCOME_TRAFFIC' | 'OUTCOME_LEADS' | 'REACH';
export type AiCampaignDestinationType = 'site' | 'messages';
export type AiPlacement =
  | 'feed'
  | 'stories'
  | 'reels'
  | 'explore'
  | 'messenger'
  | 'audience_network';

export interface CampaignAiRequest {
  prompt: string;
  storeId: string;
  requestId?: string;
  goal?: string;
  funnelStage?: string;
  budget?: number;
  durationDays?: number;
  primaryOffer?: string;
  destinationType?: string;
  region?: string;
  extraContext?: string;
}

export interface CampaignCopilotAnalysisRequest {
  storeId: string;
  requestId?: string;
  campaign: Record<string, unknown>;
  adSet?: Record<string, unknown>;
  creative?: Record<string, unknown>;
  targeting?: Record<string, unknown>;
  budget?: Record<string, unknown>;
  location?: Record<string, unknown>;
  objective?: string;
  cta?: string;
  destinationUrl?: string;
}

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

export interface CampaignAiIntent {
  objective: AiCampaignObjective | null;
  destinationType: AiCampaignDestinationType | null;
  funnelStage: AiFunnelStage | null;
  budgetAmount: number | null;
  budgetType: AiBudgetType | null;
  region: string | null;
  segment: string | null;
  offer: string | null;
  channel: string | null;
  cta: string | null;
  remarketingExpected: boolean;
  messageDestinationAvailable: boolean;
  websiteAvailable: boolean;
  metaConnected: boolean;
  pageConnected: boolean;
  whatsappAvailable: boolean;
  instagramAvailable: boolean;
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
  gender: AiGenderOutput | null;
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
  cta: string | null;
  imageSuggestion: string | null;
  destinationUrl: string | null;
}

export interface AiCampaignAudienceSummary {
  gender: AiGenderOutput | null;
  ageRange: string | null;
  interests: string[];
}

export interface AiCampaignExplanationOutput {
  strategy: string;
  audience: string;
  copy: string;
  budget: string;
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

export type CampaignAiFailureReason = 'timeout' | 'api_error' | 'invalid_response' | 'missing_api_key';
export type CampaignAiFailureStatus = 'AI_FAILED' | 'AI_NEEDS_RETRY';
export type CampaignAiSuggestionStatus = 'AI_SUCCESS' | 'AI_NEEDS_REVIEW';

export interface CampaignAiFailureMeta {
  promptVersion: string;
  model: string;
  usedFallback: boolean;
  responseValid: boolean;
  consistencyApproved?: boolean;
}

export interface CampaignAiFailureDebug {
  hasRawText: boolean;
  rawTextPreview: string;
  candidateTextPreview: string;
  rawTextLength: number;
  candidateTextLength: number;
  finishReason: string | null;
  maxOutputTokens: number | null;
  candidateTextEndsWithClosingBrace: boolean;
  consistencyErrors?: string[];
  expectedBriefingSignals?: Record<string, unknown>;
  detectedResponseSignals?: Record<string, unknown>;
  failedRules?: string[];
  immutableFieldsExpected?: Record<string, unknown>;
  immutableFieldsReceived?: Record<string, unknown>;
  immutableFieldMismatches?: string[];
  parsedType: string;
  normalizedKeys: string[];
  validationError: string;
  validationPath: string;
}

export interface CampaignAiFailureResponse {
  status: CampaignAiFailureStatus;
  reason: CampaignAiFailureReason;
  message: string;
  meta: CampaignAiFailureMeta;
  debug?: CampaignAiFailureDebug;
}

export interface CampaignAiStructuredResponse {
  status: CampaignAiSuggestionStatus;
  intent: CampaignAiIntent;
  strategy: string;
  primaryText: string;
  headline: string;
  description: string;
  cta: string;
  audience: AiCampaignAudienceSummary;
  budgetSuggestion: number | null;
  risks: string[];
  improvements: string[];
  reasoning: string[];
  explanation: AiCampaignExplanationOutput;
  planner: AiPlannerOutput;
  campaign: AiCampaignOutput;
  adSet: AiAdSetOutput;
  creative: AiCreativeOutput;
  review: AiReviewOutput;
  validation: AiValidationOutput;
  meta: CampaignAiFailureMeta;
  debug?: {
    consistencyErrors?: string[];
    expectedBriefingSignals?: Record<string, unknown>;
    detectedResponseSignals?: Record<string, unknown>;
    failedRules?: string[];
  };
}

export type AiCampaignRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AiCampaignExecutiveDecisionValue = 'PUBLISH' | 'BLOCK' | 'REVIEW' | 'RESTRUCTURE';

export interface AiCampaignBusinessDiagnosis {
  summary: string;
  mainProblem: string;
  mainOpportunity: string;
}

export interface AiCampaignPerformanceAnalysis {
  conversionPotential: string;
  financialRisk: string;
  metaApprovalRisk: string;
  scalabilityPotential: string;
}

export interface AiCampaignExecutiveDecision {
  decision: AiCampaignExecutiveDecisionValue;
  reason: string;
}

export interface AiCampaignCopilotAnalysis {
  overallScore: number;
  riskLevel: AiCampaignRiskLevel;
  isReadyToPublish: boolean;
  businessDiagnosis: AiCampaignBusinessDiagnosis;
  blockingIssues: string[];
  warnings: string[];
  recommendations: string[];
  performanceAnalysis: AiCampaignPerformanceAnalysis;
  executiveDecision: AiCampaignExecutiveDecision;
  summary?: string;
  strengths?: string[];
  issues?: string[];
  improvements?: AiCampaignCopilotImprovement[];
  confidence?: number;
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
  status: 'AI_SUCCESS';
  analysis: AiCampaignCopilotAnalysis;
  meta: CampaignAiFailureMeta;
}
