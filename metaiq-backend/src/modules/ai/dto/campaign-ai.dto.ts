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
