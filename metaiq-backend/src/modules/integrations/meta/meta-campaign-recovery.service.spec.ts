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
  let currentIntegration: any;

  const partialExecution = (overrides: Partial<MetaCampaignCreation> = {}): MetaCampaignCreation => ({
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
      imageHash: 'snapshot-image-hash-1',
      imageUrl: 'https://metaiq.dev/image.jpg',
      pageId: 'snapshot-page-1',
      destinationUrl: 'https://metaiq.dev/oferta?utm_source=meta&utm_medium=paid-social',
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
    ...overrides,
  });

  beforeEach(() => {
    currentIntegration = {
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      status: IntegrationStatus.CONNECTED,
      accessToken: 'meta-token',
      tokenExpiresAt: null,
      metadata: {
        pageId: 'current-page-1',
        destinationUrl: 'https://current.metaiq.dev/landing',
      },
    };

    campaignCreationRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
    };
    integrationRepository = {
      createQueryBuilder: jest.fn(() => ({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn(async () => currentIntegration),
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
      getAssetForStore: jest.fn(async () => ({
        id: 'asset-1',
        storeId: 'store-1',
        type: 'image',
        adAccountId: 'ad-account-1',
        storageUrl: 'https://metaiq.dev/assets/asset-1',
        metaImageHash: 'meta-image-hash-1',
      })),
      findImageAssetByMetaHash: jest.fn(async (_storeId: string, hash: string) => ({
        id: 'asset-by-hash-1',
        storeId: 'store-1',
        type: 'image',
        adAccountId: 'ad-account-1',
        storageUrl: 'https://metaiq.dev/assets/asset-by-hash-1',
        metaImageHash: hash,
      })),
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
      dto: expect.objectContaining({
        startTime: '2026-05-01T09:00:00.000Z',
        endTime: '2026-05-08T22:00:00.000Z',
        placements: ['feed', 'stories'],
        ageMin: 25,
        ageMax: 55,
        gender: 'ALL',
        initialStatus: 'PAUSED',
      }),
    }));
  });

  it('ignora overrides manuais e reaproveita o payload original persistido no retry', async () => {
    const execution = partialExecution();
    campaignCreationRepository.findOne.mockResolvedValue(execution);
    orchestrator.resumeCreation.mockResolvedValue({
      campaignId: 'meta-campaign-1',
      adSetId: 'meta-adset-1',
      creativeId: 'meta-creative-1',
      adId: 'meta-ad-1',
    });

    await service.retryPartialCampaignCreationForUser(user as any, 'store-1', execution.id, {
      name: 'Nome alterado',
      dailyBudget: 999,
      country: 'US',
    } as any);

    expect(orchestrator.resumeCreation).toHaveBeenCalledWith(expect.objectContaining({
      dto: expect.objectContaining({
        name: 'Campanha teste',
        dailyBudget: 50,
        country: 'BR',
      }),
    }));
  });

  it('usa pageId do snapshot persistido em vez da metadata atual da integração', async () => {
    const execution = partialExecution();
    currentIntegration.metadata.pageId = 'current-page-999';
    campaignCreationRepository.findOne.mockResolvedValue(execution);
    orchestrator.resumeCreation.mockResolvedValue({
      campaignId: 'meta-campaign-1',
      adSetId: 'meta-adset-1',
      creativeId: 'meta-creative-1',
      adId: 'meta-ad-1',
    });

    await service.retryPartialCampaignCreationForUser(user as any, 'store-1', execution.id, {});

    expect(orchestrator.resumeCreation).toHaveBeenCalledWith(expect.objectContaining({
      pageId: 'snapshot-page-1',
    }));
  });

  it('usa destinationUrl final do snapshot persistido em vez do website atual da store', async () => {
    const execution = partialExecution({
      requestPayload: {
        ...partialExecution().requestPayload,
        destinationUrl: 'https://metaiq.dev/oferta?utm_source=meta&utm_medium=paid-social&utm_campaign=snapshot',
      },
    });
    currentIntegration.metadata.destinationUrl = 'https://current.metaiq.dev/nova-landing';
    campaignCreationRepository.findOne.mockResolvedValue(execution);
    orchestrator.resumeCreation.mockResolvedValue({
      campaignId: 'meta-campaign-1',
      adSetId: 'meta-adset-1',
      creativeId: 'meta-creative-1',
      adId: 'meta-ad-1',
    });

    await service.retryPartialCampaignCreationForUser(user as any, 'store-1', execution.id, {});

    expect(orchestrator.resumeCreation).toHaveBeenCalledWith(expect.objectContaining({
      destinationUrl: 'https://metaiq.dev/oferta?utm_source=meta&utm_medium=paid-social&utm_campaign=snapshot',
      dto: expect.objectContaining({
        destinationUrl: 'https://metaiq.dev/oferta?utm_source=meta&utm_medium=paid-social&utm_campaign=snapshot',
      }),
    }));
  });

  it('usa imageHash do snapshot persistido mesmo que o asset atual tenha mudado', async () => {
    const execution = partialExecution({
      requestPayload: {
        ...partialExecution().requestPayload,
        imageAssetId: null,
        assetId: null,
        imageHash: 'snapshot-hash-77',
      } as any,
    });
    campaignCreationRepository.findOne.mockResolvedValue(execution);
    orchestrator.resumeCreation.mockResolvedValue({
      campaignId: 'meta-campaign-1',
      adSetId: 'meta-adset-1',
      creativeId: 'meta-creative-1',
      adId: 'meta-ad-1',
    });

    await service.retryPartialCampaignCreationForUser(user as any, 'store-1', execution.id, {});

    expect(assetsService.findImageAssetByMetaHash).toHaveBeenCalledWith('store-1', 'snapshot-hash-77', 'ad-account-1');
    expect(orchestrator.resumeCreation).toHaveBeenCalledWith(expect.objectContaining({
      dto: expect.objectContaining({
        imageHash: 'snapshot-hash-77',
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
  });

  it('blocks recovery when destination_url is invalid before calling Meta', async () => {
    const execution = partialExecution({
      requestPayload: {
        ...partialExecution().requestPayload,
        destinationUrl: 'http://metaiq.dev/oferta',
      } as any,
    });
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

  it('returns success only when cleanup removes every resource', async () => {
    const execution = partialExecution({
      metaCreativeId: 'meta-creative-1',
      metaAdId: 'meta-ad-1',
      adCreated: true,
      creativeCreated: true,
    });
    campaignCreationRepository.findOne.mockResolvedValue(execution);
    graphApi.delete.mockResolvedValue({ success: true });

    const result = await service.cleanupPartialResourcesForUser(user as any, 'store-1', execution.id);

    expect(result).toEqual({
      success: true,
      message: 'Limpeza concluída',
      cleaned: {
        ad: true,
        creative: true,
        adset: true,
        campaign: true,
      },
      cleanupPending: false,
      executionStatus: MetaCampaignCreationStatus.FAILED,
    });
    expect(graphApi.delete.mock.calls.map((call: any[]) => call[0])).toEqual([
      'meta-ad-1',
      'meta-creative-1',
      'meta-adset-1',
      'meta-campaign-1',
    ]);
    expect(campaignCreationRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      status: MetaCampaignCreationStatus.FAILED,
      errorMessage: 'Cleanup concluído sem recursos órfãos',
      metaCampaignId: null,
      metaAdSetId: null,
      metaCreativeId: null,
      metaAdId: null,
      canRetry: false,
    }));
  });

  it('fails honestly with PARTIAL_ROLLBACK when ad remains orphaned', async () => {
    const execution = partialExecution({
      metaCreativeId: 'meta-creative-1',
      metaAdId: 'meta-ad-1',
      adCreated: true,
      creativeCreated: true,
    });
    campaignCreationRepository.findOne.mockResolvedValue(execution);
    graphApi.delete.mockImplementation(async (id: string) => {
      if (id === 'meta-ad-1') {
        throw new Error('delete ad failed');
      }
      return { success: true };
    });

    await expect(service.cleanupPartialResourcesForUser(user as any, 'store-1', execution.id)).rejects.toMatchObject({
      response: expect.objectContaining({
        executionStatus: MetaCampaignCreationStatus.PARTIAL_ROLLBACK,
        cleanupPending: true,
        partialIds: expect.objectContaining({
          adId: 'meta-ad-1',
        }),
      }),
    });
  });

  it('fails honestly with PARTIAL_ROLLBACK when creative remains orphaned', async () => {
    const execution = partialExecution({
      metaCreativeId: 'meta-creative-1',
      metaAdId: 'meta-ad-1',
      adCreated: true,
      creativeCreated: true,
    });
    campaignCreationRepository.findOne.mockResolvedValue(execution);
    graphApi.delete.mockImplementation(async (id: string) => {
      if (id === 'meta-creative-1') {
        throw new Error('delete creative failed');
      }
      return { success: true };
    });

    await expect(service.cleanupPartialResourcesForUser(user as any, 'store-1', execution.id)).rejects.toMatchObject({
      response: expect.objectContaining({
        executionStatus: MetaCampaignCreationStatus.PARTIAL_ROLLBACK,
        cleanupPending: true,
        partialIds: expect.objectContaining({
          creativeId: 'meta-creative-1',
        }),
      }),
    });
  });

  it('fails honestly with PARTIAL_ROLLBACK when adset remains orphaned', async () => {
    const execution = partialExecution({
      metaCreativeId: 'meta-creative-1',
      metaAdId: 'meta-ad-1',
      adCreated: true,
      creativeCreated: true,
    });
    campaignCreationRepository.findOne.mockResolvedValue(execution);
    graphApi.delete.mockImplementation(async (id: string) => {
      if (id === 'meta-adset-1') {
        throw new Error('delete adset failed');
      }
      return { success: true };
    });

    await expect(service.cleanupPartialResourcesForUser(user as any, 'store-1', execution.id)).rejects.toMatchObject({
      response: expect.objectContaining({
        executionStatus: MetaCampaignCreationStatus.PARTIAL_ROLLBACK,
        cleanupPending: true,
        partialIds: expect.objectContaining({
          adSetId: 'meta-adset-1',
        }),
      }),
    });
  });

  it('fails honestly with CLEANUP_FAILED when the only remaining campaign cannot be deleted', async () => {
    const execution = partialExecution({
      metaAdSetId: null,
      metaCreativeId: null,
      metaAdId: null,
      adSetCreated: false,
      creativeCreated: false,
      adCreated: false,
      errorStep: 'campaign',
      currentStep: 'campaign',
    });
    campaignCreationRepository.findOne.mockResolvedValue(execution);
    graphApi.delete.mockRejectedValue(new Error('delete campaign failed'));

    await expect(service.cleanupPartialResourcesForUser(user as any, 'store-1', execution.id)).rejects.toMatchObject({
      response: expect.objectContaining({
        executionStatus: MetaCampaignCreationStatus.CLEANUP_FAILED,
        cleanupPending: true,
        partialIds: expect.objectContaining({
          campaignId: 'meta-campaign-1',
        }),
      }),
    });
  });

  it('preserves all orphan ids when multiple cleanup deletions fail', async () => {
    const execution = partialExecution({
      metaCreativeId: 'meta-creative-1',
      metaAdId: 'meta-ad-1',
      adCreated: true,
      creativeCreated: true,
    });
    campaignCreationRepository.findOne.mockResolvedValue(execution);
    graphApi.delete.mockImplementation(async (id: string) => {
      if (id === 'meta-adset-1' || id === 'meta-campaign-1') {
        throw new Error(`delete failed for ${id}`);
      }
      return { success: true };
    });

    await expect(service.cleanupPartialResourcesForUser(user as any, 'store-1', execution.id)).rejects.toMatchObject({
      response: expect.objectContaining({
        executionStatus: MetaCampaignCreationStatus.PARTIAL_ROLLBACK,
        cleanupPending: true,
        partialIds: {
          campaignId: 'meta-campaign-1',
          adSetId: 'meta-adset-1',
          creativeId: null,
          adId: null,
        },
      }),
    });
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
