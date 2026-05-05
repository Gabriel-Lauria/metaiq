import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationProvider, IntegrationStatus } from '../../../common/enums';
import { AuthenticatedUser } from '../../../common/interfaces';
import { AccessScopeService } from '../../../common/services/access-scope.service';
import { AssetsService } from '../../assets/assets.service';
import { AdAccount } from '../../ad-accounts/ad-account.entity';
import { StoreIntegration } from '../store-integration.entity';
import { MetaImageAssetResponseDto } from './dto/meta-integration.dto';
import { MetaImageUploadService } from './meta-image-upload.service';

type UploadedFile = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

@Injectable()
export class MetaAssetsService {
  constructor(
    @InjectRepository(StoreIntegration)
    private readonly integrationRepository: Repository<StoreIntegration>,
    @InjectRepository(AdAccount)
    private readonly adAccountRepository: Repository<AdAccount>,
    private readonly assetsService: AssetsService,
    private readonly accessScope: AccessScopeService,
    private readonly metaImageUploadService: MetaImageUploadService,
  ) {}

  async uploadImageToMeta(
    user: AuthenticatedUser,
    storeId: string,
    adAccountId: string,
    file: UploadedFile,
  ): Promise<MetaImageAssetResponseDto> {
    await this.accessScope.validateStoreAccess(user, storeId);

    const integration = await this.integrationRepository
      .createQueryBuilder('integration')
      .addSelect(['integration.accessToken'])
      .where('integration.storeId = :storeId', { storeId })
      .andWhere('integration.provider = :provider', { provider: IntegrationProvider.META })
      .getOne();

    if (!integration || integration.status !== IntegrationStatus.CONNECTED || !integration.accessToken) {
      throw new UnauthorizedException('Store não está conectada à Meta');
    }

    const adAccount = await this.adAccountRepository.findOne({
      where: { id: adAccountId, storeId, provider: IntegrationProvider.META },
    });

    if (!adAccount || (!adAccount.externalId && !adAccount.metaId)) {
      throw new BadRequestException('Conta de anúncios Meta inválida para esta store');
    }

    const asset = await this.assetsService.createAssetForUser(user, storeId, file);
    const metaImageHash = await this.metaImageUploadService.uploadImageFromUrl(
      integration.accessToken,
      adAccount.externalId || adAccount.metaId || '',
      asset.storageUrl,
      {
        actorId: user.id,
        tenantId: user.tenantId ?? null,
        storeId,
        adAccountExternalId: adAccount.externalId || adAccount.metaId || '',
      },
    );

    const saved = await this.assetsService.attachMetaImageData(asset.id, {
      adAccountId,
      metaImageHash,
      status: 'SENT_TO_META',
    });

    return {
      id: saved.id,
      storeId: saved.storeId,
      adAccountId: saved.adAccountId || adAccountId,
      originalName: saved.originalName,
      normalizedFileName: saved.fileName,
      mimeType: saved.mimeType,
      size: Number(saved.size),
      width: saved.width,
      height: saved.height,
      metaImageHash: saved.metaImageHash,
      metaRawImageId: saved.metaRawImageId,
      storageUrl: saved.storageUrl,
      status: saved.status,
      createdAt: saved.createdAt,
    };
  }
}
