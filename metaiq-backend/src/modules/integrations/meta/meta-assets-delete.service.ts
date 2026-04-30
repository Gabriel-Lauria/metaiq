import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AccessScopeService } from '../../../common/services/access-scope.service';
import { AuthenticatedUser } from '../../../common/interfaces';
import { AssetsService } from '../../assets/assets.service';
import { Asset } from '../../assets/entities/asset.entity';
import { Campaign } from '../../campaigns/campaign.entity';
import { MetaCampaignCreation, MetaCampaignCreationStatus } from './meta-campaign-creation.entity';

export interface DeleteAssetResult {
  assetId: string;
  action: 'soft_deleted' | 'archived';
  reason?: string;
  message: string;
}

@Injectable()
export class MetaAssetsDeleteService {
  private readonly logger = new Logger(MetaAssetsDeleteService.name);

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(MetaCampaignCreation)
    private readonly campaignCreationRepository: Repository<MetaCampaignCreation>,
    private readonly assetsService: AssetsService,
    private readonly accessScope: AccessScopeService,
  ) {}

  /**
   * Safely delete or archive an asset
   *
   * Rules:
   * - If asset is used in published campaigns → archive only
   * - If asset is not used → soft delete
   * - Validates ownership and access
   */
  async deleteAssetForUser(
    user: AuthenticatedUser,
    storeId: string,
    assetId: string,
  ): Promise<DeleteAssetResult> {
    await this.accessScope.validateStoreAccess(user, storeId);
    const asset = await this.assetsService.getAssetWithSoftDeleteCheckForUser(
      user,
      storeId,
      assetId,
    );

    const usageCount = await this.countCampaignsUsingAsset(asset);

    if (usageCount > 0) {
      this.logger.log(`Asset ${assetId} is used in ${usageCount} linked campaign(s), archiving instead of deleting`);

      const archived = await this.assetsService.archiveAsset(asset.id);
      return {
        assetId: archived.id,
        action: 'archived',
        reason: `Asset está vinculado a ${usageCount} campanha(s) publicada(s) desta store`,
        message: `Imagem arquivada com segurança. Estava sendo usada em ${usageCount} campanha(s) vinculada(s).`,
      };
    }

    this.logger.log(`Asset ${assetId} is not used in any campaigns, soft deleting`);
    const deleted = await this.assetsService.softDeleteAsset(asset.id);

    return {
      assetId: deleted.id,
      action: 'soft_deleted',
      message: 'Imagem removida com sucesso.',
    };
  }

  private async countCampaignsUsingAsset(asset: Asset): Promise<number> {
    const linkedExecutions = await this.campaignCreationRepository.find({
      where: {
        storeId: asset.storeId,
        status: In([
          MetaCampaignCreationStatus.COMPLETED,
        ]),
      },
      relations: ['campaign'],
    });

    const linkedCampaignIds = new Set<string>();

    for (const execution of linkedExecutions) {
      if (!execution.campaign) {
        continue;
      }

      if (execution.campaign.status !== 'ACTIVE' && execution.campaign.status !== 'PAUSED') {
        continue;
      }

      if (this.executionUsesAsset(execution.requestPayload || {}, asset)) {
        linkedCampaignIds.add(execution.campaign.id);
      }
    }

    if (!linkedCampaignIds.size) {
      return 0;
    }

    const linkedCampaigns = await this.campaignRepository.find({
      where: {
        storeId: asset.storeId,
        id: In(Array.from(linkedCampaignIds)),
      },
      select: ['id', 'status'],
    });

    return linkedCampaigns.filter(
      (campaign) => campaign.status === 'ACTIVE' || campaign.status === 'PAUSED',
    ).length;
  }

  private executionUsesAsset(requestPayload: Record<string, unknown>, asset: Asset): boolean {
    const imageAssetId = this.stringValue(requestPayload['imageAssetId']) || this.stringValue(requestPayload['assetId']);
    const imageHash = this.stringValue(requestPayload['imageHash']);
    return imageAssetId === asset.id || (!!asset.metaImageHash && imageHash === asset.metaImageHash);
  }

  private stringValue(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
}
