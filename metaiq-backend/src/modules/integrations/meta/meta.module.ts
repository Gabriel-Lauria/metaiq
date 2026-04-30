import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../../common/common.module';
import { MetricsModule } from '../../metrics/metrics.module';
import { IbgeModule } from '../../ibge/ibge.module';
import { AssetsModule } from '../../assets/assets.module';
import { AdAccount } from '../../ad-accounts/ad-account.entity';
import { Campaign } from '../../campaigns/campaign.entity';
import { OAuthState } from '../oauth-state.entity';
import { StoreIntegration } from '../store-integration.entity';
import { MetaCampaignOrchestrator } from './meta-campaign.orchestrator';
import { MetaAssetsService } from './meta-assets.service';
import { MetaAssetsDeleteService } from './meta-assets-delete.service';
import { MetaCampaignCreation } from './meta-campaign-creation.entity';
import { MetaGraphApiClient } from './meta-graph-api.client';
import { MetaCampaignRecoveryService } from './meta-campaign-recovery.service';
import { MetaImageUploadService } from './meta-image-upload.service';
import { MetaCampaignCreationAuditController, MetaIntegrationController, MetaOAuthCallbackController } from './meta.controller';
import { MetaCampaignRecoveryController } from './meta-campaign-recovery.controller';
import { MetaIntegrationService } from './meta.service';
import { MetaSyncService } from './meta-sync.service';

@Module({
  imports: [CommonModule, MetricsModule, IbgeModule, AssetsModule, TypeOrmModule.forFeature([StoreIntegration, OAuthState, AdAccount, Campaign, MetaCampaignCreation])],
  controllers: [MetaIntegrationController, MetaOAuthCallbackController, MetaCampaignCreationAuditController, MetaCampaignRecoveryController],
  providers: [MetaIntegrationService, MetaSyncService, MetaGraphApiClient, MetaImageUploadService, MetaAssetsService, MetaAssetsDeleteService, MetaCampaignOrchestrator, MetaCampaignRecoveryService],
  exports: [MetaIntegrationService, MetaSyncService, MetaGraphApiClient, MetaImageUploadService, MetaAssetsService, MetaAssetsDeleteService, MetaCampaignOrchestrator, MetaCampaignRecoveryService],
})
export class MetaIntegrationModule {}
