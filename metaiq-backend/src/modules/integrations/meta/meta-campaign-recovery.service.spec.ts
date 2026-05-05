import { ForbiddenException } from '@nestjs/common';
import { IntegrationProvider, IntegrationStatus, Role, SyncStatus } from '../../../common/enums';
import { MetaCampaignCreation, MetaCampaignCreationStatus } from './meta-campaign-creation.entity';
import { MetaCampaignRecoveryService } from './meta-campaign-recovery.service';

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
  let assetsService: any;

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
      startTime: '2026-05-01T09:00:00.000Z',
      endTime: '2026-05-08T22:00:00.000Z',
      country: 'BR',
      ageMin: 25,
      ageMax: 55,
      gender: 'ALL',
      adAccountId: 'ad-account-1',
      message: 'Mensagem teste',
      headline: 'Headline teste',
      description: 'Descricao teste',
      imageUrl: 'https://metaiq.dev/image.jpg',
      destinationUrl: 'https://metaiq.dev/oferta',
      pixelId: 'pixel-1',
      conversionEvent: 'PURCHASE',
      placements: ['feed', 'stories'],
      specialAdCategories: ['NONE'],
      state: 'PR',
      stateName: 'Parana',
      region: 'Sul',
      city: 'Curitiba',
      cityId: 4106902,
      initialStatus: 'PAUSED',
    },
    payloadHash: 'hash-1',
    retryCount: 0,
    lastRetryAt: null,
    canRetry: true,
    userMessage: null,
    metaErrorDetails: null,
    currentStep: 'creative',
    stepState: null,
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
    assetsService = {
      getAssetForStore: jest.fn(),
    };
    accessScope = {
      validateStoreAccess: jest.fn(async () => ({ id: 'store-1' })),
      validateAdAccountInStoreAccess: jest.fn(async () => ({})),
      validateCampaignInAdAccountAccess: jest.fn(async () => ({})),
    };

    service = new MetaCampaignRecoveryService(
      campaignCreationRepository,
      integrationRepository,
      adAccountRepository,
      campaignRepository,
      orchestrator,
      graphApi,
      accessScope,
      assetsService,
    );
  });

  it('resumes partial execution without recreating existing campaign and adset', async () => {
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

  it('rebuilds the full adset payload for real recovery before calling Meta', async () => {
    const execution = partialExecution();
    execution.errorStep = 'adset';
    execution.currentStep = 'adset';
    execution.metaAdSetId = null;
    execution.adSetCreated = false;
    campaignCreationRepository.findOne.mockResolvedValue(execution);
    orchestrator.resumeCreation.mockResolvedValue({
      campaignId: 'meta-campaign-1',
      adSetId: 'meta-adset-1',
      creativeId: 'meta-creative-1',
      adId: 'meta-ad-1',
    });

    await service.retryPartialCampaignCreationForUser(user as any, 'store-1', execution.id, {});

    expect(orchestrator.resumeCreation).toHaveBeenCalledWith(expect.objectContaining({
      dto: expect.objectContaining({
        startTime: '2026-05-01T09:00:00.000Z',
        endTime: '2026-05-08T22:00:00.000Z',
        ageMin: 25,
        ageMax: 55,
        gender: 'ALL',
        state: 'PR',
        stateName: 'Parana',
        region: 'Sul',
        city: 'Curitiba',
        cityId: 4106902,
        pixelId: 'pixel-1',
        conversionEvent: 'PURCHASE',
        placements: ['feed', 'stories'],
        specialAdCategories: ['NONE'],
      }),
    }));
  });

  it('returns a useful error when recovery fails again', async () => {
    const execution = partialExecution();
    campaignCreationRepository.findOne.mockResolvedValue(execution);
    orchestrator.resumeCreation.mockRejectedValue({
      message: 'Invalid parameter',
      response: {
        data: {
          error: {
            code: 100,
            error_subcode: 1815752,
            type: 'OAuthException',
            message: 'Invalid parameter',
            error_user_title: 'Creative invalido',
            error_user_msg: 'Verifique page_id e link_data.',
            fbtrace_id: 'trace-recovery-1',
          },
        },
      },
    });

    await expect(
      service.retryPartialCampaignCreationForUser(user as any, 'store-1', execution.id, {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        executionId: execution.id,
        executionStatus: MetaCampaignCreationStatus.PARTIAL,
        step: 'creative',
        hint: expect.stringContaining('pageId'),
        metaError: expect.objectContaining({
          code: 100,
          subcode: 1815752,
          userTitle: 'Creative invalido',
          userMessage: 'Verifique page_id e link_data.',
          fbtraceId: 'trace-recovery-1',
          step: 'creative',
        }),
      }),
    });
    expect(campaignCreationRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      metaErrorDetails: expect.objectContaining({
        code: 100,
        subcode: 1815752,
        userTitle: 'Creative invalido',
        userMessage: 'Verifique page_id e link_data.',
        fbtraceId: 'trace-recovery-1',
        step: 'creative',
      }),
    }));
  });

  it('blocks recovery when destination_url is invalid before calling Meta', async () => {
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

  it('blocks roles without recovery permission', async () => {
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

  it('rolls back partial resources in reverse dependency order and marks execution failed', async () => {
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
    expect(campaignCreationRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      status: MetaCampaignCreationStatus.FAILED,
      errorMessage: 'Cleanup: recursos removidos',
    }));
  });

  it('returns detailed execution status', async () => {
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
