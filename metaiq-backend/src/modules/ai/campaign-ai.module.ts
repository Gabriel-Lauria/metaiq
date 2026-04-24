import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { StoreIntegration } from '../integrations/store-integration.entity';
import { Store } from '../stores/store.entity';
import { CampaignAiController } from './campaign-ai.controller';
import { CampaignAiService } from './campaign-ai.service';

@Module({
  imports: [CommonModule, TypeOrmModule.forFeature([Store, StoreIntegration])],
  controllers: [CampaignAiController],
  providers: [CampaignAiService],
  exports: [CampaignAiService],
})
export class CampaignAiModule {}
