import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsUrl, IsUUID, MaxLength, Min } from 'class-validator';
import { IntegrationStatus, SyncStatus } from '../../../../common/enums';
import { META_CTA_TYPES, transformMetaCtaInput, type MetaCallToActionType } from '../meta-cta.constants';

export class ConnectMetaIntegrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalBusinessId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalAdAccountId?: string;

  @IsOptional()
  @IsString()
  accessToken?: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  @IsDateString()
  tokenExpiresAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export interface MetaOAuthStartResponseDto {
  authorizationUrl: string;
  expiresAt: Date;
}

export interface StoreIntegrationStatusDto {
  id: string;
  storeId: string;
  provider: string;
  status: IntegrationStatus;
  externalBusinessId: string | null;
  externalAdAccountId: string | null;
  tokenType: string | null;
  tokenExpiresAt: Date | null;
  grantedScopes: string[];
  providerUserId: string | null;
  pageId?: string | null;
  pageName?: string | null;
  oauthConnectedAt: Date | null;
  lastSyncAt: Date | null;
  lastSyncStatus: SyncStatus;
  lastSyncError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MetaAdAccountDto {
  externalId: string;
  name: string;
  status: 'ACTIVE' | 'DISABLED' | 'UNSETTLED' | 'UNKNOWN';
}

export interface MetaCampaignDto {
  externalId: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  objective?: 'CONVERSIONS' | 'REACH' | 'TRAFFIC' | 'LEADS' | null;
  dailyBudget?: number | null;
  startTime?: Date | null;
  endTime?: Date | null;
}

export interface MetaPageDto {
  id: string;
  name: string;
  category?: string | null;
}

export class UpdateMetaPageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  pageId: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  pageName?: string;
}

export class CreateMetaCampaignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  objective: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  dailyBudget: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2)
  country: string;

  @IsUUID()
  @IsNotEmpty()
  adAccountId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message: string;

  @IsUrl({ require_protocol: true })
  @IsNotEmpty()
  @MaxLength(1000)
  imageUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  stateName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  cityId?: number;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  destinationUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  description?: string;

  @IsOptional()
  @Transform(({ value }) => transformMetaCtaInput(value))
  @IsString()
  @IsIn(META_CTA_TYPES)
  cta?: MetaCallToActionType;

  @IsOptional()
  @IsString()
  @IsIn(['PAUSED', 'ACTIVE'])
  initialStatus?: 'PAUSED' | 'ACTIVE';

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export interface CreateMetaCampaignResponseDto {
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
  step?: 'campaign' | 'adset' | 'creative' | 'ad' | 'persist';
  partialIds?: Partial<Record<'campaignId' | 'adSetId' | 'creativeId' | 'adId', string>>;
  hint?: string;
}

export class UpdateMetaIntegrationStatusDto {
  @IsEnum(IntegrationStatus)
  status: IntegrationStatus;

  @IsOptional()
  @IsEnum(SyncStatus)
  lastSyncStatus?: SyncStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  lastSyncError?: string | null;
}

export interface MetaSyncPlan {
  storeId: string;
  provider: 'META';
  steps: Array<
    | 'VALIDATE_STORE_CONNECTION'
    | 'FETCH_EXTERNAL_AD_ACCOUNTS'
    | 'UPSERT_AD_ACCOUNTS'
    | 'UPSERT_CAMPAIGNS'
    | 'UPSERT_METRICS'
    | 'RECORD_SYNC_RESULT'
  >;
}

// ─────────────────────────────────────────────────────────
// Recovery DTOs - Para recuperação de campanhas parciais
// ─────────────────────────────────────────────────────────

export class RetryPartialCampaignDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  accessToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  adAccountExternalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  pageId?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  destinationUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  dailyBudget?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'PAUSED'])
  initialStatus?: 'ACTIVE' | 'PAUSED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @IsOptional()
  @Transform(({ value }) => transformMetaCtaInput(value))
  @IsString()
  @MaxLength(40)
  @IsIn(META_CTA_TYPES)
  cta?: MetaCallToActionType;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  description?: string;
}

export class CleanupPartialResourcesDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  accessToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  adAccountExternalId?: string;
}
