import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { Campaign } from '../campaigns/campaign.entity';
import { StoreIntegration } from '../integrations/store-integration.entity';
import { MetricDaily } from '../metrics/metric-daily.entity';
import { Store } from '../stores/store.entity';
import { CampaignAiController } from './campaign-ai.controller';
import { CampaignAiService } from './campaign-ai.service';

@Module({
  imports: [CommonModule, TypeOrmModule.forFeature([Store, StoreIntegration, Campaign, MetricDaily])],
  controllers: [CampaignAiController],
  providers: [CampaignAiService],
  exports: [CampaignAiService],
})
export class CampaignAiModule {}
