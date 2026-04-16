import { IsDateString, IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
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
