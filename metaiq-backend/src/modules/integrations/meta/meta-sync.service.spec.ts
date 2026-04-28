import { BadRequestException, ConflictException, ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import { MetaSyncService } from './meta-sync.service';
import { MetaIntegrationService } from './meta.service';
import { IntegrationProvider, IntegrationStatus, Role, SyncStatus } from '../../../common/enums';
import { StoreIntegration } from '../store-integration.entity';
import { AuthenticatedUser } from '../../../common/interfaces';

function integration(overrides: Partial<StoreIntegration> = {}): StoreIntegration {
  return {
    id: 'integration-1',
    storeId: 'store-1',
    provider: IntegrationProvider.META,
    status: IntegrationStatus.CONNECTED,
    externalBusinessId: null,
    externalAdAccountId: null,
    accessToken: 'meta-token',
    refreshToken: null,
    tokenExpiresAt: new Date(Date.now() + 60_000),
    tokenType: 'bearer',
    grantedScopes: 'ads_read,business_management',
    providerUserId: null,
    oauthConnectedAt: null,
    lastSyncAt: null,
    lastSyncStatus: SyncStatus.NEVER_SYNCED,
    lastSyncError: null,
    metadata: null,
    store: undefined as never,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function queryBuilderMock(integrationValue: StoreIntegration, affected = 1): any {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    getOne: jest.fn(async () => integrationValue),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    execute: jest.fn(async () => ({ affected })),
  };
}

describe('MetaSyncService', () => {
  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'operational@metaiq.dev',
    role: Role.OPERATIONAL,
    managerId: 'manager-1',
  };

  let service: MetaSyncService;
  let integrationRepo: any;
  let adAccountRepo: any;
  let campaignRepo: any;
  let accessScope: any;
  let metaService: jest.Mocked<Pick<MetaIntegrationService, 'fetchAdAccountsRaw' | 'normalizeAdAccounts' | 'fetchCampaignsRaw' | 'normalizeCampaigns'>>;

  beforeEach(() => {
    jest.clearAllMocks();

    integrationRepo = {
      save: jest.fn(async (value) => value),
      createQueryBuilder: jest.fn(() => queryBuilderMock(integration())),
    };
    adAccountRepo = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    campaignRepo = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    accessScope = {
      validateStoreAccess: jest.fn(async () => ({ id: 'store-1' })),
      validateAdAccountAccess: jest.fn(async (_requester: AuthenticatedUser, adAccountId: string) => {
        const adAccount = await adAccountRepo.findOne({ where: { id: adAccountId } });
        if (!adAccount) {
          throw new BadRequestException('AdAccount Meta não encontrada para a store informada');
        }

        return adAccount;
      }),
      validateAdAccountInStoreAccess: jest.fn(async (_requester: AuthenticatedUser, storeId: string, adAccountId: string) => {
        const adAccount = await adAccountRepo.findOne({ where: { id: adAccountId } });
        if (!adAccount || adAccount.storeId !== storeId) {
          throw new BadRequestException('AdAccount Meta não encontrada para a store informada');
        }

        return adAccount;
      }),
    };
    metaService = {
      fetchAdAccountsRaw: jest.fn(),
      normalizeAdAccounts: jest.fn((raw) => raw),
      fetchCampaignsRaw: jest.fn(),
      normalizeCampaigns: jest.fn((raw) => raw),
    };

    service = new MetaSyncService(
      integrationRepo,
      adAccountRepo,
      campaignRepo,
      accessScope,
      metaService as unknown as MetaIntegrationService,
    );
  });

  it('bloqueia sync concorrente quando ja existe IN_PROGRESS', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => queryBuilderMock(
      integration({ lastSyncStatus: SyncStatus.IN_PROGRESS }),
      0,
    ));

    await expect(service.syncAdAccountsForUser(user, 'store-1')).rejects.toBeInstanceOf(ConflictException);
    expect(metaService.fetchAdAccountsRaw).not.toHaveBeenCalled();
  });

  it('marca token expirado e bloqueia chamada externa', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => queryBuilderMock(
      integration({ tokenExpiresAt: new Date(Date.now() - 1000) }),
    ));

    await expect(service.syncAdAccountsForUser(user, 'store-1')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(integrationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: IntegrationStatus.EXPIRED,
      lastSyncStatus: SyncStatus.ERROR,
      lastSyncError: 'TOKEN_EXPIRED',
    }));
    expect(metaService.fetchAdAccountsRaw).not.toHaveBeenCalled();
  });

  it('rejeita store sem integracao conectada', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => queryBuilderMock(
      integration({ status: IntegrationStatus.NOT_CONNECTED }),
    ));

    await expect(service.syncAdAccountsForUser(user, 'store-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(metaService.fetchAdAccountsRaw).not.toHaveBeenCalled();
  });

  it('registra rate limit da Meta como erro de sync', async () => {
    metaService.fetchAdAccountsRaw.mockRejectedValueOnce({
      response: {
        data: { error: { code: 4, message: 'Application request limit reached' } },
      },
    });

    await expect(service.syncAdAccountsForUser(user, 'store-1')).rejects.toBeInstanceOf(HttpException);
    expect(integrationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      lastSyncStatus: SyncStatus.ERROR,
      lastSyncError: 'RATE_LIMIT',
    }));
  });

  it('sincroniza ad accounts validas e marca SUCCESS', async () => {
    metaService.fetchAdAccountsRaw.mockResolvedValueOnce([
      { externalId: 'act_123', name: 'Conta Nova', status: 'ACTIVE' },
      { externalId: 'act_456', name: 'Conta Existente', status: 'UNSETTLED' },
    ]);
    const existing = {
      id: 'ad-account-2',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_456',
      name: 'Nome antigo',
      active: true,
      syncStatus: SyncStatus.NEVER_SYNCED,
      lastSeenAt: null,
    };
    adAccountRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);

    const result = await service.syncAdAccountsForUser(user, 'store-1');

    expect(result).toHaveLength(2);
    expect(adAccountRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      externalId: 'act_123',
      syncStatus: SyncStatus.SUCCESS,
      active: true,
    }));
    expect(existing.name).toBe('Conta Existente');
    expect(existing.active).toBe(false);
    expect(existing.syncStatus).toBe(SyncStatus.SUCCESS);
    expect(integrationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      lastSyncStatus: SyncStatus.SUCCESS,
      lastSyncError: null,
    }));
  });

  it('permite OPERATIONAL vinculado a store executar sync', async () => {
    const operationalUser = { ...user, role: Role.OPERATIONAL };
    metaService.fetchAdAccountsRaw.mockResolvedValueOnce([]);

    await expect(service.syncAdAccountsForUser(operationalUser, 'store-1')).resolves.toEqual([]);
    expect(metaService.fetchAdAccountsRaw).toHaveBeenCalled();
  });

  it('bloqueia CLIENT de executar sync', async () => {
    const clientUser = { ...user, role: Role.CLIENT };

    await expect(service.syncAdAccountsForUser(clientUser, 'store-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(metaService.fetchAdAccountsRaw).not.toHaveBeenCalled();
  });

  it('sincroniza campanhas com campos reais da Meta sem inventar defaults', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => queryBuilderMock(integration()));
    const adAccount = {
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
    };
    adAccountRepo.findOne.mockResolvedValue(adAccount);
    metaService.fetchCampaignsRaw.mockResolvedValueOnce([
      {
        externalId: 'campaign-1',
        name: 'Campanha Real',
        status: 'ACTIVE',
        objective: 'LEADS',
        dailyBudget: 180,
        startTime: new Date('2026-04-20T09:00:00Z'),
        endTime: new Date('2026-04-27T22:00:00Z'),
      },
      {
        externalId: 'campaign-2',
        name: 'Campanha Parcial',
        status: 'PAUSED',
        objective: null,
        dailyBudget: null,
        startTime: null,
        endTime: null,
      },
    ]);
    metaService.normalizeCampaigns.mockImplementation((raw) => raw);
    const existingCampaign = {
      id: 'campaign-local-2',
      storeId: 'store-1',
      externalId: 'campaign-2',
      name: 'Antiga',
      status: 'ACTIVE',
      objective: 'TRAFFIC',
      dailyBudget: 90,
      startTime: new Date('2026-04-01T00:00:00Z'),
      endTime: null,
      adAccountId: 'old-ad-account',
      lastSeenAt: null,
    };
    campaignRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingCampaign);

    const result = await service.syncCampaignsForUser(user, 'store-1', 'ad-account-1');

    expect(result).toHaveLength(2);
    expect(campaignRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      metaId: 'campaign-1',
      externalId: 'campaign-1',
      objective: 'LEADS',
      dailyBudget: 180,
      startTime: new Date('2026-04-20T09:00:00Z'),
      endTime: new Date('2026-04-27T22:00:00Z'),
    }));
    expect(existingCampaign).toEqual(expect.objectContaining({
      name: 'Campanha Parcial',
      status: 'PAUSED',
      objective: 'TRAFFIC',
      dailyBudget: 90,
      startTime: new Date('2026-04-01T00:00:00Z'),
    }));
    expect(accessScope.validateAdAccountInStoreAccess).toHaveBeenCalledWith(
      user,
      'store-1',
      'ad-account-1',
    );
  });

  it('bloqueia sync de campanhas quando o ad account pertence a outra store', async () => {
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-9',
      storeId: 'store-2',
      provider: IntegrationProvider.META,
      externalId: 'act_999',
      metaId: 'act_999',
    });

    await expect(
      service.syncCampaignsForUser(user, 'store-1', 'ad-account-9'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(metaService.fetchCampaignsRaw).not.toHaveBeenCalled();
  });
});
