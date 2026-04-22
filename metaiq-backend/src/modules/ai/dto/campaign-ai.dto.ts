import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

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
  storeId: string;
}
