import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../../common/common.module';
import { AdAccount } from '../../ad-accounts/ad-account.entity';
import { Campaign } from '../../campaigns/campaign.entity';
import { OAuthState } from '../oauth-state.entity';
import { StoreIntegration } from '../store-integration.entity';
import { MetaCampaignOrchestrator } from './meta-campaign.orchestrator';
import { MetaCampaignCreation } from './meta-campaign-creation.entity';
import { MetaGraphApiClient } from './meta-graph-api.client';
import { MetaCampaignCreationAuditController, MetaIntegrationController, MetaOAuthCallbackController } from './meta.controller';
import { MetaIntegrationService } from './meta.service';
import { MetaSyncService } from './meta-sync.service';

@Module({
  imports: [CommonModule, TypeOrmModule.forFeature([StoreIntegration, OAuthState, AdAccount, Campaign, MetaCampaignCreation])],
  controllers: [MetaIntegrationController, MetaOAuthCallbackController, MetaCampaignCreationAuditController],
  providers: [MetaIntegrationService, MetaSyncService, MetaGraphApiClient, MetaCampaignOrchestrator],
  exports: [MetaIntegrationService, MetaSyncService, MetaGraphApiClient, MetaCampaignOrchestrator],
})
export class MetaIntegrationModule {}
