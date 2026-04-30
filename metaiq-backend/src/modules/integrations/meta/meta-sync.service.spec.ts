import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
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
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn(async () => integrationValue),
    getMany: jest.fn(async () => []),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    execute: jest.fn(async () => ({ affected })),
  };
}

describe('MetaSyncService', () => {
  const operationalUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'operational@metaiq.dev',
    role: Role.OPERATIONAL,
    managerId: 'manager-1',
    tenantId: 'tenant-1',
  };

  let service: MetaSyncService;
  let integrationRepo: any;
  let adAccountRepo: any;
  let campaignRepo: any;
  let accessScope: any;
  let incidentReporter: any;
  let auditService: any;
  let metricsService: any;
  let metaService: jest.Mocked<Pick<MetaIntegrationService,
    'fetchAdAccountsRaw' | 'normalizeAdAccounts' | 'fetchCampaignsRaw' | 'normalizeCampaigns' | 'fetchCampaignMetricsRaw'
  >>;

  beforeEach(() => {
    jest.clearAllMocks();

    integrationRepo = {
      save: jest.fn(async (value) => value),
      find: jest.fn(async () => []),
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
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () => []),
      })),
    };
    accessScope = {
      validateStoreAccess: jest.fn(async () => ({ id: 'store-1' })),
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
      fetchCampaignMetricsRaw: jest.fn(),
    };
    incidentReporter = {
      report: jest.fn(async () => undefined),
    };
    auditService = {
      record: jest.fn(),
    };
    metricsService = {
      upsertDailyMetricForSystemJob: jest.fn(async (value) => value),
    };

    service = new MetaSyncService(
      integrationRepo,
      adAccountRepo,
      campaignRepo,
      accessScope,
      metaService as unknown as MetaIntegrationService,
      incidentReporter,
      auditService,
      metricsService,
    );
  });

  it('bloqueia sync concorrente quando ja existe IN_PROGRESS nao expirado', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => queryBuilderMock(
      integration({ lastSyncStatus: SyncStatus.IN_PROGRESS, lastSyncAt: new Date() }),
      0,
    ));

    await expect(service.syncAdAccountsForUser(operationalUser, 'store-1')).rejects.toBeInstanceOf(ConflictException);
    expect(metaService.fetchAdAccountsRaw).not.toHaveBeenCalled();
  });

  it('recupera lock stale antes de sincronizar novamente', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => queryBuilderMock(
      integration({ lastSyncStatus: SyncStatus.IN_PROGRESS, lastSyncAt: new Date(Date.now() - (16 * 60 * 1000)) }),
      1,
    ));
    metaService.fetchAdAccountsRaw.mockResolvedValueOnce([]);

    await expect(service.syncAdAccountsForUser(operationalUser, 'store-1')).resolves.toEqual([]);
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'meta.ad_accounts.sync.stale_recovery',
      reason: 'stale_sync_lock',
    }));
  });

  it('permite MANAGER dentro da store do proprio tenant', async () => {
    const managerUser = { ...operationalUser, role: Role.MANAGER };
    metaService.fetchAdAccountsRaw.mockResolvedValueOnce([]);

    await expect(service.syncAdAccountsForUser(managerUser, 'store-1')).resolves.toEqual([]);
    expect(metaService.fetchAdAccountsRaw).toHaveBeenCalled();
  });

  it('bloqueia CLIENT de executar sync', async () => {
    const clientUser = { ...operationalUser, role: Role.CLIENT };

    await expect(service.syncAdAccountsForUser(clientUser, 'store-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(metaService.fetchAdAccountsRaw).not.toHaveBeenCalled();
  });

  it('marca token expirado e bloqueia chamada externa', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => queryBuilderMock(
      integration({ tokenExpiresAt: new Date(Date.now() - 1000) }),
    ));

    await expect(service.syncAdAccountsForUser(operationalUser, 'store-1')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(integrationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: IntegrationStatus.EXPIRED,
      lastSyncStatus: SyncStatus.ERROR,
      lastSyncError: 'TOKEN_EXPIRED',
    }));
    expect(metaService.fetchAdAccountsRaw).not.toHaveBeenCalled();
  });

  it('sincroniza campanhas com campos reais da Meta sem inventar defaults', async () => {
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
    ]);

    const result = await service.syncCampaignsForUser(operationalUser, 'store-1', 'ad-account-1');

    expect(result).toHaveLength(1);
    expect(campaignRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      metaId: 'campaign-1',
      externalId: 'campaign-1',
      objective: 'LEADS',
      dailyBudget: 180,
    }));
  });

  it('faz upsert real de MetricDaily sem duplicar linha por campanha e data', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => [integration()]),
      getOne: jest.fn(async () => integration()),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({ affected: 1 })),
    }));
    campaignRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => [
        {
          id: 'campaign-local-1',
          externalId: 'meta-campaign-1',
          storeId: 'store-1',
          status: 'ACTIVE',
        },
      ]),
    }));
    metaService.fetchCampaignMetricsRaw.mockResolvedValueOnce([
      {
        date_start: '2026-04-29',
        impressions: '100',
        clicks: '20',
        spend: '50.25',
        actions: [{ action_type: 'lead', value: '3' }],
        purchase_roas: [{ value: '2' }],
      },
    ]);

    const result = await service.syncMetricsForConnectedStores();

    expect(result).toEqual({ stores: 1, campaigns: 1, metricRows: 1, errors: 0 });
    expect(metricsService.upsertDailyMetricForSystemJob).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 'campaign-local-1',
      date: '2026-04-29',
      impressions: 100,
      clicks: 20,
      spend: 50.25,
      conversions: 3,
      revenue: 100.5,
    }));
  });
});
