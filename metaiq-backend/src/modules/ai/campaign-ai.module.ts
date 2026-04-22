import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from '../stores/store.entity';
import { CampaignAiController } from './campaign-ai.controller';
import { CampaignAiService } from './campaign-ai.service';

@Module({
  imports: [TypeOrmModule.forFeature([Store])],
  controllers: [CampaignAiController],
  providers: [CampaignAiService],
  exports: [CampaignAiService],
})
export class CampaignAiModule {}
