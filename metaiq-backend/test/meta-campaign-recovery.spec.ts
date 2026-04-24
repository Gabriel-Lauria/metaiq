import { ForbiddenException } from '@nestjs/common';
import { MetaCampaignRecoveryService } from '../src/modules/integrations/meta/meta-campaign-recovery.service';
import { MetaCampaignCreation, MetaCampaignCreationStatus } from '../src/modules/integrations/meta/meta-campaign-creation.entity';
import { IntegrationProvider, IntegrationStatus, Role, SyncStatus } from '../src/common/enums';

describe('MetaCampaignRecoveryService', () => {
  const user = {
    id: 'user-1',
    email: 'operational@metaiq.dev',
    role: Role.OPERATIONAL,
    tenantId: 'tenant-1',
    managerId: 'manager-1',
  };

  let service: MetaCampaignRecoveryService;
  let campaignCreationRepository: any;
  let integrationRepository: any;
  let adAccountRepository: any;
  let campaignRepository: any;
  let orchestrator: any;
  let graphApi: any;
  let accessScope: any;

  const partialExecution = (): MetaCampaignCreation => ({
    id: 'exec-1',
    storeId: 'store-1',
    requesterUserId: 'user-1',
    adAccountId: 'ad-account-1',
    campaignId: null,
    idempotencyKey: 'key-123',
    status: MetaCampaignCreationStatus.PARTIAL,
    campaignCreated: true,
    adSetCreated: true,
    creativeCreated: false,
    adCreated: false,
    metaCampaignId: 'meta-campaign-1',
    metaAdSetId: 'meta-adset-1',
    metaCreativeId: null,
    metaAdId: null,
    errorStep: 'creative',
    errorMessage: 'Invalid parameter',
    requestPayload: {
      name: 'Campanha teste',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 50,
      country: 'BR',
      adAccountId: 'ad-account-1',
      message: 'Mensagem teste',
      imageUrl: 'https://metaiq.dev/image.jpg',
      destinationUrl: 'https://metaiq.dev/oferta',
      initialStatus: 'PAUSED',
    },
    payloadHash: 'hash-1',
    store: null as any,
    requester: null as any,
    adAccount: {
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
      syncStatus: SyncStatus.SUCCESS,
      active: true,
    } as any,
    campaign: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    campaignCreationRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
    };
    integrationRepository = {
      createQueryBuilder: jest.fn(() => ({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn(async () => ({
          storeId: 'store-1',
          provider: IntegrationProvider.META,
          status: IntegrationStatus.CONNECTED,
          accessToken: 'meta-token',
          tokenExpiresAt: null,
          metadata: {
            pageId: 'page-1',
            destinationUrl: 'https://metaiq.dev/oferta',
          },
        })),
      })),
    };
    adAccountRepository = {
      findOne: jest.fn(async () => ({
        id: 'ad-account-1',
        storeId: 'store-1',
        provider: IntegrationProvider.META,
        externalId: 'act_123',
        metaId: 'act_123',
        syncStatus: SyncStatus.SUCCESS,
        active: true,
      })),
    };
    campaignRepository = {
      findOne: jest.fn(async () => null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'local-campaign-1', ...value })),
    };
    orchestrator = {
      resumeCreation: jest.fn(),
    };
    graphApi = {
      delete: jest.fn(),
    };
    accessScope = {
      validateStoreAccess: jest.fn(async () => ({ id: 'store-1' })),
    };

    service = new MetaCampaignRecoveryService(
      campaignCreationRepository,
      integrationRepository,
      adAccountRepository,
      campaignRepository,
      orchestrator,
      graphApi,
      accessScope,
    );
  });

  it('retoma execução parcial sem recriar campaign/adset já existentes', async () => {
    const execution = partialExecution();
    campaignCreationRepository.findOne.mockResolvedValue(execution);
    orchestrator.resumeCreation.mockImplementation(async ({ startingIds }: any) => ({
      ...startingIds,
      creativeId: 'meta-creative-1',
      adId: 'meta-ad-1',
    }));

    const result = await service.retryPartialCampaignCreationForUser(user as any, 'store-1', execution.id, {});

    expect(result).toEqual({
      success: true,
      message: 'Campanha retomada e concluída com sucesso',
      ids: {
        campaignId: 'meta-campaign-1',
        adSetId: 'meta-adset-1',
        creativeId: 'meta-creative-1',
        adId: 'meta-ad-1',
      },
    });
    expect(orchestrator.resumeCreation).toHaveBeenCalledWith(expect.objectContaining({
      startingIds: {
        campaignId: 'meta-campaign-1',
        adSetId: 'meta-adset-1',
        creativeId: undefined,
        adId: undefined,
      },
    }));
  });

  it('retorna erro útil quando retry volta a falhar', async () => {
    const execution = partialExecution();
    campaignCreationRepository.findOne.mockResolvedValue(execution);
    orchestrator.resumeCreation.mockRejectedValue(new Error('Invalid parameter'));

    await expect(
      service.retryPartialCampaignCreationForUser(user as any, 'store-1', execution.id, {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        executionId: execution.id,
        executionStatus: MetaCampaignCreationStatus.PARTIAL,
        step: 'creative',
        hint: expect.stringContaining('pageId'),
      }),
    });
  });

  it('bloqueia retry com destination_url inválido antes de chamar a Meta', async () => {
    const execution = partialExecution();
    execution.requestPayload = {
      ...execution.requestPayload,
      destinationUrl: 'http://metaiq.dev/oferta',
    };
    campaignCreationRepository.findOne.mockResolvedValue(execution);

    await expect(
      service.retryPartialCampaignCreationForUser(user as any, 'store-1', execution.id, {}),
    ).rejects.toThrow('destination_url inválido');

    expect(orchestrator.resumeCreation).not.toHaveBeenCalled();
  });

  it('bloqueia roles sem permissão de recovery', async () => {
    const execution = partialExecution();
    campaignCreationRepository.findOne.mockResolvedValue(execution);

    await expect(
      service.retryPartialCampaignCreationForUser(
        { ...user, role: Role.CLIENT } as any,
        'store-1',
        execution.id,
        {},
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('limpa recursos parciais em ordem reversa', async () => {
    const execution = partialExecution();
    execution.metaCreativeId = 'meta-creative-1';
    execution.metaAdId = 'meta-ad-1';
    campaignCreationRepository.findOne.mockResolvedValue(execution);
    graphApi.delete.mockResolvedValue({ success: true });

    const result = await service.cleanupPartialResourcesForUser(user as any, 'store-1', execution.id);

    expect(result.success).toBe(true);
    expect(graphApi.delete.mock.calls.map((call: any[]) => call[0])).toEqual([
      'meta-ad-1',
      'meta-creative-1',
      'meta-adset-1',
      'meta-campaign-1',
    ]);
  });

  it('retorna status detalhado da execução', async () => {
    const execution = partialExecution();
    campaignCreationRepository.findOne.mockResolvedValue({
      ...execution,
      store: { id: 'store-1', name: 'Store 1' },
      campaign: null,
    });

    const result = await service.getExecutionStatusForUser(user as any, 'store-1', execution.id);

    expect(result).toMatchObject({
      id: execution.id,
      status: MetaCampaignCreationStatus.PARTIAL,
      partialIds: {
        campaign: 'meta-campaign-1',
        adset: 'meta-adset-1',
        creative: null,
        ad: null,
      },
    });
  });
});
