import { BadRequestException } from '@nestjs/common';
import { Role, IntegrationProvider, IntegrationStatus } from '../../../common/enums';
import { AuthenticatedUser } from '../../../common/interfaces';
import { MetaAssetsService } from './meta-assets.service';

describe('MetaAssetsService', () => {
  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'manager@metaiq.dev',
    role: Role.MANAGER,
    managerId: 'manager-1',
  };

  let service: MetaAssetsService;
  let integrationRepository: any;
  let adAccountRepository: any;
  let assetsService: any;
  let accessScope: any;
  let metaImageUploadService: any;

  beforeEach(() => {
    integrationRepository = {
      createQueryBuilder: jest.fn(() => ({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn(async () => ({
          id: 'integration-1',
          storeId: 'store-1',
          provider: IntegrationProvider.META,
          status: IntegrationStatus.CONNECTED,
          externalAdAccountId: '123',
          accessToken: 'meta-token',
        })),
      })),
    };

    adAccountRepository = {
      findOne: jest.fn(async () => ({
        id: 'ad-account-1',
        storeId: 'store-1',
        provider: IntegrationProvider.META,
        externalId: '123',
        metaId: '123',
        active: true,
      })),
      find: jest.fn(async () => []),
    };

    assetsService = {
      createAssetForUser: jest.fn(async () => ({
        id: 'asset-1',
        storeId: 'store-1',
        uploadedByUserId: 'user-1',
        type: 'image',
        originalName: 'banner.png',
        fileName: 'banner.png',
        mimeType: 'image/png',
        size: 2048,
        width: 1200,
        height: 628,
        storageUrl: 'https://metaiq.dev/assets/asset-1',
        createdAt: new Date('2026-04-30T12:00:00Z'),
      })),
      attachMetaImageData: jest.fn(async () => ({
        id: 'asset-1',
        storeId: 'store-1',
        adAccountId: 'ad-account-1',
        originalName: 'banner.png',
        fileName: 'banner.png',
        mimeType: 'image/png',
        size: 2048,
        width: 1200,
        height: 628,
        metaImageHash: 'meta-image-hash-1',
        metaRawImageId: 'meta-raw-image-1',
        storageUrl: 'https://metaiq.dev/assets/asset-1',
        status: 'SENT_TO_META',
        createdAt: new Date('2026-04-30T12:00:00Z'),
      })),
    };

    accessScope = {
      validateStoreAccess: jest.fn(async () => undefined),
    };

    metaImageUploadService = {
      uploadImageFromUrl: jest.fn(async () => 'meta-image-hash-1'),
    };

    service = new MetaAssetsService(
      integrationRepository,
      adAccountRepository,
      assetsService,
      accessScope,
      metaImageUploadService,
    );
  });

  it('envia a imagem para a Meta e persiste o image_hash', async () => {
    const result = await service.uploadImageToMeta(user, 'store-1', 'ad-account-1', {
      buffer: Buffer.from('fake'),
      size: 2048,
      mimetype: 'image/png',
      originalname: 'banner.png',
    });

    expect(metaImageUploadService.uploadImageFromUrl).toHaveBeenCalledWith(
      'meta-token',
      '123',
      'https://metaiq.dev/assets/asset-1',
      expect.objectContaining({
        actorId: 'user-1',
        storeId: 'store-1',
      }),
    );
    expect(assetsService.attachMetaImageData).toHaveBeenCalledWith('asset-1', expect.objectContaining({
      adAccountId: 'ad-account-1',
      metaImageHash: 'meta-image-hash-1',
    }));
    expect(result.metaImageHash).toBe('meta-image-hash-1');
  });

  it('rejeita upload sem arquivo', async () => {
    assetsService.createAssetForUser.mockRejectedValueOnce(new BadRequestException('Arquivo é obrigatório'));

    await expect(service.uploadImageToMeta(user, 'store-1', 'ad-account-1', undefined)).rejects.toThrow('Arquivo é obrigatório');
  });

  it('rejeita mimetype inválido propagando a validação do asset', async () => {
    assetsService.createAssetForUser.mockRejectedValueOnce(new BadRequestException('Formato inválido'));

    await expect(service.uploadImageToMeta(user, 'store-1', 'ad-account-1', {
      buffer: Buffer.from('fake'),
      size: 100,
      mimetype: 'application/pdf',
      originalname: 'arquivo.pdf',
    })).rejects.toThrow('Formato inválido');
  });

  it('falha com erro claro quando a Meta não retorna image_hash', async () => {
    metaImageUploadService.uploadImageFromUrl.mockRejectedValueOnce(
      new BadRequestException('A Meta nao retornou image_hash apos o upload da imagem'),
    );

    await expect(service.uploadImageToMeta(user, 'store-1', 'ad-account-1', {
      buffer: Buffer.from('fake'),
      size: 2048,
      mimetype: 'image/png',
      originalname: 'banner.png',
    })).rejects.toThrow('A Meta nao retornou image_hash apos o upload da imagem');
  });

  it('traduz 400 da Meta em BadRequestException amigável para imagem inválida', async () => {
    metaImageUploadService.uploadImageFromUrl.mockRejectedValueOnce(
      new BadRequestException('A Meta não conseguiu processar essa imagem. Tente JPG ou PNG em boa qualidade.'),
    );

    await expect(service.uploadImageToMeta(user, 'store-1', 'ad-account-1', {
      buffer: Buffer.from('fake'),
      size: 2048,
      mimetype: 'image/png',
      originalname: 'banner.png',
    })).rejects.toThrow('A Meta não conseguiu processar essa imagem. Tente JPG ou PNG em boa qualidade.');
  });

  it('traduz erro de permissão/token em mensagem de reconexão', async () => {
    metaImageUploadService.uploadImageFromUrl.mockRejectedValueOnce(
      new BadRequestException('A integração Meta não autorizou o envio da imagem. Reconecte a conta.'),
    );

    await expect(service.uploadImageToMeta(user, 'store-1', 'ad-account-1', {
      buffer: Buffer.from('fake'),
      size: 2048,
      mimetype: 'image/png',
      originalname: 'banner.png',
    })).rejects.toThrow('A integração Meta não autorizou o envio da imagem. Reconecte a conta.');
  });
});
