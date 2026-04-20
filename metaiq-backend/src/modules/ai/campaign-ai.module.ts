import { Module } from '@nestjs/common';
import { CampaignAiController } from './campaign-ai.controller';
import { CampaignAiService } from './campaign-ai.service';

@Module({
  controllers: [CampaignAiController],
  providers: [CampaignAiService],
  exports: [CampaignAiService],
})
export class CampaignAiModule {}
