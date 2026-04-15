import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  @Length(1, 100)
  metaId: string;

  @IsString()
  @Length(1, 200)
  name: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'PAUSED', 'ARCHIVED'])
  status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

  @IsOptional()
  @IsIn(['CONVERSIONS', 'REACH', 'TRAFFIC', 'LEADS'])
  objective?: 'CONVERSIONS' | 'REACH' | 'TRAFFIC' | 'LEADS';

  @IsNumber()
  dailyBudget: number;

  @IsDateString()
  startTime: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsUUID()
  @IsNotEmpty()
  storeId: string;

  @IsUUID()
  @IsNotEmpty()
  adAccountId: string;
}

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'PAUSED', 'ARCHIVED'])
  status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

  @IsOptional()
  @IsIn(['CONVERSIONS', 'REACH', 'TRAFFIC', 'LEADS'])
  objective?: 'CONVERSIONS' | 'REACH' | 'TRAFFIC' | 'LEADS';

  @IsOptional()
  @IsNumber()
  dailyBudget?: number;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsUUID()
  @IsNotEmpty()
  storeId?: string;

  @IsOptional()
  @IsUUID()
  @IsNotEmpty()
  adAccountId?: string;
}
