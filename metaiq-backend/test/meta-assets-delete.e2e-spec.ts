import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { MetaIntegrationController } from '../src/modules/integrations/meta/meta.controller';
import { MetaIntegrationService } from '../src/modules/integrations/meta/meta.service';
import { MetaAssetsService } from '../src/modules/integrations/meta/meta-assets.service';
import { MetaAssetsDeleteService } from '../src/modules/integrations/meta/meta-assets-delete.service';
import { MetaSyncService } from '../src/modules/integrations/meta/meta-sync.service';
import { AuditService } from '../src/common/services/audit.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { Role } from '../src/common/enums';

jest.setTimeout(60000);

describe('MetaIntegrationController - Delete Asset (E2E)', () => {
  let app: INestApplication;
  let metaAssetsDeleteService: MetaAssetsDeleteService;

  const mockAuthToken = 'mock-jwt-token';
  const mockUser = {
    id: 'user-123',
    email: 'manager@example.com',
    tenantId: 'tenant-123',
    role: Role.MANAGER,
    managerTenantId: null,
  };

  const mockJwtGuard = {
    canActivate: jest.fn((context) => {
      const request = context.switchToHttp().getRequest();
      request.user = mockUser;
      return true;
    }),
  };

  const mockRolesGuard = {
    canActivate: jest.fn(() => true),
  };

  beforeEach(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [MetaIntegrationController],
      providers: [
        {
          provide: MetaIntegrationService,
          useValue: {
            getStatusForUser: jest.fn(),
            startOAuthForUser: jest.fn(),
            buildSyncPlanForUser: jest.fn(),
            fetchPagesForStoreForUser: jest.fn(),
            updatePageForUser: jest.fn(),
            connectForUser: jest.fn(),
            updateStatusForUser: jest.fn(),
            disconnectForUser: jest.fn(),
            createCampaignForUser: jest.fn(),
            listCampaignCreations: jest.fn(),
          },
        },
        {
          provide: MetaAssetsService,
          useValue: {
            uploadImageToMeta: jest.fn(),
          },
        },
        {
          provide: MetaAssetsDeleteService,
          useValue: {
            deleteAssetForUser: jest.fn(),
          },
        },
        {
          provide: MetaSyncService,
          useValue: {
            fetchAdAccountsForUser: jest.fn(),
            syncAdAccountsForUser: jest.fn(),
            fetchCampaignsForUser: jest.fn(),
            syncCampaignsForUser: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            record: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard);

    const module: TestingModule = await moduleBuilder.compile();

    app = module.createNestApplication();
    await app.init();

    metaAssetsDeleteService = module.get<MetaAssetsDeleteService>(MetaAssetsDeleteService);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('DELETE /integrations/meta/stores/:storeId/assets/images/:assetId', () => {
    it('should soft delete asset when not used in campaigns', async () => {
      jest.spyOn(metaAssetsDeleteService, 'deleteAssetForUser').mockResolvedValueOnce({
        assetId: 'asset-123',
        action: 'soft_deleted',
        message: 'Imagem removida com sucesso.',
      });

      const response = await request(app.getHttpServer())
        .delete('/integrations/meta/stores/store-123/assets/images/asset-123')
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual(
        expect.objectContaining({
          message: 'Imagem removida com sucesso.',
          action: 'soft_deleted',
          status: 'DELETED',
        }),
      );

      expect(metaAssetsDeleteService.deleteAssetForUser).toHaveBeenCalledWith(expect.anything(), 'store-123', 'asset-123');
    });

    it('should archive asset when used in published campaigns', async () => {
      jest.spyOn(metaAssetsDeleteService, 'deleteAssetForUser').mockResolvedValueOnce({
        assetId: 'asset-123',
        action: 'archived',
        reason: 'Asset está vinculado a 1 campanha(s) publicada(s)',
        message: 'Imagem arquivada com segurança. Estava sendo usada em 1 campanha(s).',
      });

      const response = await request(app.getHttpServer())
        .delete('/integrations/meta/stores/store-123/assets/images/asset-123')
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual(
        expect.objectContaining({
          message: 'Imagem arquivada com segurança. Estava sendo usada em 1 campanha(s).',
          action: 'archived',
          reason: 'Asset está vinculado a 1 campanha(s) publicada(s)',
          status: 'ARCHIVED',
        }),
      );
    });

    it('should return 404 when asset does not exist', async () => {
      const { NotFoundException } = await import('@nestjs/common');

      jest.spyOn(metaAssetsDeleteService, 'deleteAssetForUser').mockRejectedValueOnce(
        new NotFoundException('Asset não encontrado'),
      );

      await request(app.getHttpServer())
        .delete('/integrations/meta/stores/store-123/assets/images/non-existent')
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 400 when asset belongs to different store', async () => {
      const { BadRequestException } = await import('@nestjs/common');

      jest.spyOn(metaAssetsDeleteService, 'deleteAssetForUser').mockRejectedValueOnce(
        new BadRequestException('Asset não pertence a esta loja'),
      );

      await request(app.getHttpServer())
        .delete('/integrations/meta/stores/store-123/assets/images/asset-123')
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should log audit event on successful deletion', async () => {
      const auditService = app.get<AuditService>(AuditService);
      const auditSpy = jest.spyOn(auditService, 'record');

      jest.spyOn(metaAssetsDeleteService, 'deleteAssetForUser').mockResolvedValueOnce({
        assetId: 'asset-123',
        action: 'soft_deleted',
        message: 'Imagem removida com sucesso.',
      });

      await request(app.getHttpServer())
        .delete('/integrations/meta/stores/store-123/assets/images/asset-123')
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .expect(HttpStatus.OK);

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'meta.asset.image.delete',
          status: 'success',
        }),
      );
    });
  });
});
