import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';
import { IntegrationStatus, SyncStatus } from '../../../../common/enums';

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

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
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
  executionStatus?: 'ACTIVE';
  storeId: string;
  adAccountId: string;
  platform: 'META';
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
