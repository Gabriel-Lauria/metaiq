import { ForbiddenException } from '@nestjs/common';
import { MetaAssetsDeleteService } from './meta-assets-delete.service';
import { AssetsService } from '../../assets/assets.service';
import { Campaign } from '../../campaigns/campaign.entity';
import { Asset } from '../../assets/entities/asset.entity';
import { AuthenticatedUser } from '../../../common/interfaces';
import { Role } from '../../../common/enums';
import { MetaCampaignCreation, MetaCampaignCreationStatus } from './meta-campaign-creation.entity';

describe('MetaAssetsDeleteService', () => {
  const authorizedUser: AuthenticatedUser = {
    id: 'user-123',
    email: 'authorized@example.com',
    tenantId: 'tenant-1',
    role: Role.ADMIN,
  };

  const otherTenantUser: AuthenticatedUser = {
    id: 'user-999',
    email: 'other@example.com',
    tenantId: 'tenant-2',
    role: Role.ADMIN,
  };

  const otherTenantManager: AuthenticatedUser = {
    id: 'manager-999',
    email: 'manager@example.com',
    tenantId: 'tenant-2',
    role: Role.MANAGER,
  };

  const operationalWithoutStoreAccess: AuthenticatedUser = {
    id: 'op-999',
    email: 'op@example.com',
    tenantId: 'tenant-1',
    role: Role.OPERATIONAL,
  };

  const mockAsset: Asset = {
    id: 'asset-123',
    storeId: 'store-123',
    uploadedByUserId: 'user-123',
    adAccountId: 'ad-account-123',
    type: 'image',
    originalName: 'test-image.jpg',
    fileName: 'test-image.jpg',
    mimeType: 'image/jpeg',
    size: 1024,
    width: 1920,
    height: 1080,
    storageUrl: 'http://localhost:3004/api/assets/asset-123/content',
    metaImageHash: 'meta-hash-123',
    metaRawImageId: 'meta-image-id-123',
    metaRawResponse: null,
    status: 'SENT_TO_META',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    archivedAt: null,
    deletedAt: null,
    store: undefined as never,
    uploadedBy: undefined as never,
  };

  let service: MetaAssetsDeleteService;
  let campaignRepository: any;
  let campaignCreationRepository: any;
  let assetsService: any;
  let accessScope: any;

  beforeEach(() => {
    campaignRepository = {
      find: jest.fn(async () => []),
    };
    campaignCreationRepository = {
      find: jest.fn(async () => []),
    };
    assetsService = {
      getAssetWithSoftDeleteCheckForUser: jest.fn(async () => mockAsset),
      softDeleteAsset: jest.fn(async () => ({ ...mockAsset, deletedAt: new Date() })),
      archiveAsset: jest.fn(async () => ({ ...mockAsset, archivedAt: new Date() })),
    };
    accessScope = {
      validateStoreAccess: jest.fn(async (user: AuthenticatedUser, storeId: string) => {
        if (user.id === authorizedUser.id && storeId === 'store-123') {
          return { id: storeId };
        }

        throw new ForbiddenException('Store fora do escopo do usuário');
      }),
    };

    service = new MetaAssetsDeleteService(
      campaignRepository as never,
      campaignCreationRepository as never,
      assetsService as never,
      accessScope as never,
    );
  });

  it('permite soft delete para usuário autorizado quando o asset não está em uso', async () => {
    const result = await service.deleteAssetForUser(authorizedUser, 'store-123', 'asset-123');

    expect(result).toEqual({
      assetId: 'asset-123',
      action: 'soft_deleted',
      message: 'Imagem removida com sucesso.',
    });
    expect(accessScope.validateStoreAccess).toHaveBeenCalledWith(authorizedUser, 'store-123');
    expect(assetsService.getAssetWithSoftDeleteCheckForUser).toHaveBeenCalledWith(
      authorizedUser,
      'store-123',
      'asset-123',
    );
    expect(assetsService.softDeleteAsset).toHaveBeenCalledWith('asset-123');
    expect(assetsService.archiveAsset).not.toHaveBeenCalled();
  });

  it('bloqueia usuário de outro tenant mesmo conhecendo storeId e assetId', async () => {
    await expect(
      service.deleteAssetForUser(otherTenantUser, 'store-123', 'asset-123'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(assetsService.getAssetWithSoftDeleteCheckForUser).not.toHaveBeenCalled();
    expect(assetsService.softDeleteAsset).not.toHaveBeenCalled();
  });

  it('bloqueia MANAGER de outro tenant', async () => {
    await expect(
      service.deleteAssetForUser(otherTenantManager, 'store-123', 'asset-123'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(assetsService.getAssetWithSoftDeleteCheckForUser).not.toHaveBeenCalled();
  });

  it('bloqueia OPERATIONAL sem acesso à store', async () => {
    await expect(
      service.deleteAssetForUser(operationalWithoutStoreAccess, 'store-123', 'asset-123'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(assetsService.getAssetWithSoftDeleteCheckForUser).not.toHaveBeenCalled();
  });

  it('faz archive seguro quando o asset está em uso por campanha publicada', async () => {
    campaignCreationRepository.find.mockResolvedValueOnce([
      {
        status: MetaCampaignCreationStatus.COMPLETED,
        requestPayload: {
          imageAssetId: 'asset-123',
          imageHash: 'meta-hash-123',
        },
        campaign: {
          id: 'campaign-1',
          status: 'PAUSED',
        },
      } as unknown as MetaCampaignCreation,
    ]);
    campaignRepository.find.mockResolvedValueOnce([
      {
        id: 'campaign-1',
        status: 'PAUSED',
      },
    ]);

    const result = await service.deleteAssetForUser(authorizedUser, 'store-123', 'asset-123');

    expect(result).toEqual({
      assetId: 'asset-123',
      action: 'archived',
      reason: 'Asset está vinculado a 1 campanha(s) publicada(s) desta store',
      message: 'Imagem arquivada com segurança. Estava sendo usada em 1 campanha(s) vinculada(s).',
    });
    expect(assetsService.archiveAsset).toHaveBeenCalledWith('asset-123');
    expect(assetsService.softDeleteAsset).not.toHaveBeenCalled();
  });

  it('não conta campanhas globais não vinculadas ao asset', async () => {
    campaignCreationRepository.find.mockResolvedValueOnce([
      {
        status: MetaCampaignCreationStatus.COMPLETED,
        requestPayload: {
          imageAssetId: 'another-asset',
        },
        campaign: {
          id: 'campaign-x',
          status: 'ACTIVE',
        },
      } as unknown as MetaCampaignCreation,
    ]);

    const result = await service.deleteAssetForUser(authorizedUser, 'store-123', 'asset-123');

    expect(result.action).toBe('soft_deleted');
    expect(campaignRepository.find).not.toHaveBeenCalled();
  });

  it('não conta campanhas arquivadas como uso ativo', async () => {
    campaignCreationRepository.find.mockResolvedValueOnce([
      {
        status: MetaCampaignCreationStatus.COMPLETED,
        requestPayload: {
          imageAssetId: 'asset-123',
        },
        campaign: {
          id: 'campaign-archived',
          status: 'ARCHIVED',
        },
      } as unknown as MetaCampaignCreation,
    ]);

    const result = await service.deleteAssetForUser(authorizedUser, 'store-123', 'asset-123');
    expect(result.action).toBe('soft_deleted');
  });

  it('conta campanha vinculada por imageHash quando assetId não estiver no payload', async () => {
    campaignCreationRepository.find.mockResolvedValueOnce([
      {
        status: MetaCampaignCreationStatus.COMPLETED,
        requestPayload: {
          imageHash: 'meta-hash-123',
        },
        campaign: {
          id: 'campaign-2',
          status: 'ACTIVE',
        },
      } as unknown as MetaCampaignCreation,
    ]);
    campaignRepository.find.mockResolvedValueOnce([
      {
        id: 'campaign-2',
        status: 'ACTIVE',
      },
    ]);

    const result = await service.deleteAssetForUser(authorizedUser, 'store-123', 'asset-123');
    expect(result.action).toBe('archived');
  });
});
