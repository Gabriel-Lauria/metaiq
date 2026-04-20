import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CampaignAiSuggestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  prompt: string;
}
