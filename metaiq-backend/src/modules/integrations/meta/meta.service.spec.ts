import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MetaIntegrationService } from './meta.service';
import { MetaCampaignOrchestrator } from './meta-campaign.orchestrator';
import { MetaGraphApiClient } from './meta-graph-api.client';
import { MetaImageUploadService } from './meta-image-upload.service';
import { IntegrationProvider, IntegrationStatus, Role, SyncStatus } from '../../../common/enums';
import { AuthenticatedUser } from '../../../common/interfaces';
import { StoreIntegration } from '../store-integration.entity';
import { MetaCampaignCreationStatus } from './meta-campaign-creation.entity';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

function integration(overrides: Partial<StoreIntegration> = {}): StoreIntegration {
  return {
    id: 'integration-1',
    storeId: 'store-1',
    provider: IntegrationProvider.META,
    status: IntegrationStatus.NOT_CONNECTED,
    externalBusinessId: null,
    externalAdAccountId: null,
    accessToken: null,
    refreshToken: null,
    tokenExpiresAt: null,
    tokenType: null,
    grantedScopes: null,
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

function connectedCampaignIntegration(overrides: Partial<StoreIntegration> = {}): StoreIntegration {
  return integration({
    status: IntegrationStatus.CONNECTED,
    accessToken: 'meta-token',
    grantedScopes: 'ads_read,ads_management,business_management',
    metadata: { pageId: 'page-1', destinationUrl: 'https://metaiq.dev/oferta' },
    ...overrides,
  });
}

function metaImageUploadResponse() {
  return {
    data: {
      images: {
        'metaiq-creative.jpg': {
          hash: 'meta-image-hash-1',
        },
      },
    },
  };
}

function downloadedImageResponse() {
  return {
    data: Buffer.from('fake-image'),
    headers: { 'content-type': 'image/jpeg' },
  };
}

function createCampaignPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Campanha MVP',
    objective: 'OUTCOME_TRAFFIC',
    dailyBudget: 25,
    startTime: '2026-05-01T09:00:00.000Z',
    endTime: '2026-05-08T22:00:00.000Z',
    country: 'BR',
    adAccountId: 'ad-account-1',
    message: 'Mensagem do anuncio',
    imageUrl: 'https://metaiq.dev/image.jpg',
    placements: ['feed', 'stories'],
    conversionEvent: 'Purchase',
    utmSource: 'meta',
    utmMedium: 'paid-social',
    ...overrides,
  };
}

describe('MetaIntegrationService OAuth', () => {
  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'operational@metaiq.dev',
    role: Role.OPERATIONAL,
    managerId: 'manager-1',
  };

  let service: MetaIntegrationService;
  let integrationRepo: any;
  let oauthStateRepo: any;
  let adAccountRepo: any;
  let campaignRepo: any;
  let campaignCreationRepo: any;
  let accessScope: any;
  let assetsService: any;
  let config: ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.get.mockReset();
    mockedAxios.post.mockReset();
    mockedAxios.get.mockImplementation(async (url: string) => {
      const normalizedUrl = String(url);

      if (normalizedUrl.includes('/oauth/access_token')) {
        return { data: { access_token: 'long-lived-token', token_type: 'bearer', expires_in: 5183944 } } as any;
      }

      if (normalizedUrl.includes('/me')) {
        return { data: { id: 'provider-user-1' } } as any;
      }

      if (
        normalizedUrl.includes('metaiq.dev')
        || normalizedUrl.includes('cdn.')
        || normalizedUrl.includes('localhost:3004/api/assets/')
      ) {
        return {
          data: Buffer.from('fake-image'),
          headers: { 'content-type': 'image/jpeg' },
        } as any;
      }

      return { data: {} } as any;
    });

    integrationRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...integration(), ...value })),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getOne: jest.fn(async () => integration()),
      })),
    };
    oauthStateRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      update: jest.fn(async () => ({ affected: 1 })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn(async () => ({ raw: [] })),
      })),
    };
    adAccountRepo = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    campaignRepo = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: value.id ?? 'campaign-local-1', ...value })),
    };
    campaignCreationRepo = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({
        id: value.id ?? 'creation-1',
        status: MetaCampaignCreationStatus.IN_PROGRESS,
        campaignCreated: false,
        adSetCreated: false,
        creativeCreated: false,
        adCreated: false,
        metaCampaignId: null,
        metaAdSetId: null,
        metaCreativeId: null,
        metaAdId: null,
        errorStep: null,
        errorMessage: null,
        ...value,
      })),
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
    assetsService = {
      getAssetForStore: jest.fn(async () => ({
        id: 'asset-1',
        storeId: 'store-1',
        type: 'image',
        storageUrl: 'http://localhost:3004/api/assets/asset-1/content',
        status: 'VALIDATED',
      })),
    };
    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'meta.appId': '123456789012345',
          'meta.appSecret': 'app-secret',
          'meta.redirectUri': 'http://localhost:3004/api/integrations/meta/oauth/callback',
          'meta.apiVersion': 'v19.0',
          'meta.oauthScopes': ['ads_read', 'ads_management', 'business_management'],
          'meta.enableDevConnect': false,
          'app.nodeEnv': 'test',
          'app.frontendUrl': 'http://localhost:4200',
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    const graphApi = new MetaGraphApiClient(config);
    const metaImageUpload = new MetaImageUploadService(graphApi);
    const campaignOrchestrator = new MetaCampaignOrchestrator(graphApi, metaImageUpload);
    const ibgeService = {
      validateCityForState: jest.fn().mockResolvedValue(true),
    };

    service = new MetaIntegrationService(
      integrationRepo,
      oauthStateRepo,
      adAccountRepo,
      campaignRepo,
      campaignCreationRepo,
      accessScope,
      assetsService,
      config,
      graphApi,
      campaignOrchestrator,
      ibgeService as any,
    );
  });

  it('gera state seguro e URL de autorização para a store validada', async () => {
    const result = await service.startOAuthForUser(user, 'store-1');

    expect(accessScope.validateStoreAccess).toHaveBeenCalledWith(user, 'store-1');
    expect(oauthStateRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: IntegrationProvider.META,
        storeId: 'store-1',
      }),
      expect.objectContaining({ usedAt: expect.any(Date) }),
    );
    expect(oauthStateRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.META,
      storeId: 'store-1',
      initiatedByUserId: 'user-1',
      usedAt: null,
    }));
    expect(new URL(result.authorizationUrl).searchParams.get('state')).toHaveLength(43);
    expect(result.authorizationUrl).toContain('client_id=123456789012345');
    expect(result.authorizationUrl).toContain('response_type=code');
  });

  it('rejeita META_APP_ID ausente ou não numérico antes de montar a URL', async () => {
    (config.get as jest.Mock).mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        'meta.appId': 'SEU_APP_ID_AQUI',
        'meta.appSecret': 'app-secret',
        'meta.redirectUri': 'http://localhost:3004/api/integrations/meta/oauth/callback',
        'meta.apiVersion': 'v19.0',
        'meta.oauthScopes': ['ads_read', 'ads_management'],
        'app.nodeEnv': 'test',
      };
      return values[key];
    });

    await expect(service.startOAuthForUser(user, 'store-1')).rejects.toThrow('META_APP_ID inválido');
    expect(oauthStateRepo.save).not.toHaveBeenCalled();
  });

  it('bloqueia o connect manual quando a flag dev está desativada', async () => {
    await expect(service.connectForUser(user, 'store-1', {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloqueia o connect manual em produção mesmo com flag ligada', async () => {
    (config.get as jest.Mock).mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        'meta.enableDevConnect': true,
        'app.nodeEnv': 'production',
      };
      return values[key];
    });

    await expect(service.connectForUser(user, 'store-1', {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('não retorna tokens no DTO de status', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => integration({
        accessToken: 'secret-token',
        refreshToken: 'secret-refresh',
        grantedScopes: 'ads_read,ads_management,business_management',
      })),
    }));

    const result = await service.getStatusForUser(user, 'store-1');

    expect(result).toEqual(expect.objectContaining({
      storeId: 'store-1',
      grantedScopes: ['ads_read', 'ads_management', 'business_management'],
    }));
    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('refreshToken');
    expect(result).not.toHaveProperty('metadata');
  });

  it('impede reutilização de state', async () => {
    oauthStateRepo.createQueryBuilder.mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({ raw: [] })),
    });
    oauthStateRepo.findOne.mockResolvedValue({
      id: 'state-1',
      state: 'used-state',
      storeId: 'store-1',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
    });

    const result = await service.handleOAuthCallback({ code: 'code', state: 'used-state' });

    expect(result.redirectUrl).toContain('metaOAuth=error');
    expect(result.redirectUrl).toContain('state+ja+utilizado');
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('impede state expirado', async () => {
    oauthStateRepo.createQueryBuilder.mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({ raw: [] })),
    });
    oauthStateRepo.findOne.mockResolvedValue({
      id: 'state-1',
      state: 'expired-state',
      storeId: 'store-1',
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await service.handleOAuthCallback({ code: 'code', state: 'expired-state' });

    expect(result.redirectUrl).toContain('metaOAuth=error');
    expect(result.redirectUrl).toContain('state+expirado');
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('troca code por token no backend e marca a integração como conectada', async () => {
    oauthStateRepo.createQueryBuilder.mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({
        raw: [{
          id: 'state-1',
          state: 'valid-state',
          storeId: 'store-1',
          usedAt: new Date(),
          expiresAt: new Date(Date.now() + 60000),
        }],
      })),
    });
    oauthStateRepo.findOne.mockResolvedValue({
      id: 'state-1',
      state: 'valid-state',
      storeId: 'store-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60000),
    });
    mockedAxios.get
      .mockResolvedValueOnce({ data: { access_token: 'meta-token', token_type: 'bearer', expires_in: 3600 } })
      .mockResolvedValueOnce({ data: { id: 'provider-user-1' } });

    const result = await service.handleOAuthCallback({ code: 'code', state: 'valid-state' });

    expect(result.redirectUrl).toContain('metaOAuth=success');
    expect(integrationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: IntegrationStatus.CONNECTED,
      accessToken: 'meta-token',
      providerUserId: 'provider-user-1',
      grantedScopes: 'ads_read,ads_management,business_management',
    }));
  });

  it('busca Ad Accounts reais na Meta usando token salvo e resposta normalizada', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    }));
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [
          { id: 'act_123', name: 'Conta Teste', account_status: 1 },
          { id: 'act_456', name: 'Conta Pausada', account_status: 2 },
        ],
      },
    });

    const result = await service.fetchAdAccountsForStoreForUser(user, 'store-1');

    expect(accessScope.validateStoreAccess).toHaveBeenCalledWith(user, 'store-1');
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://graph.facebook.com/v19.0/me/adaccounts',
      expect.objectContaining({
        headers: { Authorization: 'Bearer meta-token' },
        params: { fields: 'id,name,account_status' },
      }),
    );
    expect(result).toEqual([
      { externalId: 'act_123', name: 'Conta Teste', status: 'ACTIVE' },
      { externalId: 'act_456', name: 'Conta Pausada', status: 'DISABLED' },
    ]);
  });

  it('lista páginas Meta disponíveis para a store conectada', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    }));
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [
          { id: 'page-1', name: 'Prata e Art', category: 'Jewelry' },
          { id: 'page-2', name: 'Outra Página', category: 'Retail' },
        ],
      },
    });

    const result = await service.fetchPagesForStoreForUser(user, 'store-1');

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://graph.facebook.com/v19.0/me/accounts',
      expect.objectContaining({
        headers: { Authorization: 'Bearer meta-token' },
        params: { fields: 'id,name,category' },
      }),
    );
    expect(result).toEqual([
      { id: 'page-1', name: 'Prata e Art', category: 'Jewelry' },
      { id: 'page-2', name: 'Outra Página', category: 'Retail' },
    ]);
  });

  it('salva pageId e pageName em metadata da integração', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration({
        metadata: { destinationUrl: 'https://metaiq.dev/oferta' },
      })),
    }));
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [
          { id: 'page-1', name: 'Prata e Art', category: 'Jewelry' },
        ],
      },
    });

    const result = await service.updatePageForUser(user, 'store-1', { pageId: 'page-1' });

    expect(integrationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        destinationUrl: 'https://metaiq.dev/oferta',
        pageId: 'page-1',
        pageName: 'Prata e Art',
      }),
    }));
    expect(result).toEqual(expect.objectContaining({
      pageId: 'page-1',
      pageName: 'Prata e Art',
    }));
  });

  it('rejeita busca de Ad Accounts quando a store nao esta conectada', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => integration({ status: IntegrationStatus.NOT_CONNECTED })),
    }));

    await expect(service.fetchAdAccountsForStoreForUser(user, 'store-1')).rejects.toThrow('Store não está conectada à Meta');
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('marca integracao como ERROR quando a Meta rejeita token', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => integration({
        status: IntegrationStatus.CONNECTED,
        accessToken: 'expired-token',
      })),
    }));
    mockedAxios.get.mockRejectedValueOnce({
      response: {
        status: 401,
        data: { error: { code: 190, message: 'Invalid OAuth 2.0 Access Token' } },
      },
    });

    await expect(service.fetchAdAccountsForStoreForUser(user, 'store-1')).rejects.toThrow('Token Meta inválido');
    expect(integrationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: IntegrationStatus.ERROR,
      lastSyncStatus: SyncStatus.ERROR,
      lastSyncError: 'TOKEN_INVALID',
    }));
  });

  it('sincroniza Ad Accounts sem duplicar registros existentes', async () => {
    jest.spyOn(service, 'fetchAdAccountsForStoreForUser').mockResolvedValue([
      { externalId: 'act_123', name: 'Conta Nova', status: 'ACTIVE' },
      { externalId: 'act_456', name: 'Conta Existente Atualizada', status: 'DISABLED' },
    ]);
    const existing = {
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_456',
      name: 'Conta Existente',
      active: true,
      lastSeenAt: null,
    };
    adAccountRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);

    await service.syncAdAccountsForStoreForUser(user, 'store-1');

    expect(adAccountRepo.findOne).toHaveBeenCalledWith({
      where: {
        storeId: 'store-1',
        provider: IntegrationProvider.META,
        externalId: 'act_123',
      },
    });
    expect(adAccountRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      metaId: 'act_123',
      externalId: 'act_123',
      provider: IntegrationProvider.META,
      syncStatus: SyncStatus.SUCCESS,
      name: 'Conta Nova',
      userId: 'user-1',
      storeId: 'store-1',
      active: true,
    }));
    expect(adAccountRepo.create).toHaveBeenCalledTimes(1);
    expect(existing.name).toBe('Conta Existente Atualizada');
    expect(existing.active).toBe(false);
    expect(existing.lastSeenAt).toBeInstanceOf(Date);
    expect(integrationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      lastSyncStatus: SyncStatus.SUCCESS,
      lastSyncError: null,
    }));
  });

  it('busca campaigns reais da Meta por AdAccount da store', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    }));
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
    });
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [
          { id: 'campaign-1', name: 'Campanha Ativa', status: 'ACTIVE' },
          { id: 'campaign-2', name: 'Campanha Removida', status: 'DELETED' },
        ],
      },
    });

    const result = await service.fetchCampaignsForAdAccountForUser(user, 'store-1', 'ad-account-1');

    expect(accessScope.validateAdAccountInStoreAccess).toHaveBeenCalledWith(
      user,
      'store-1',
      'ad-account-1',
    );
    expect(adAccountRepo.findOne).toHaveBeenCalledWith({
      where: {
        id: 'ad-account-1',
      },
    });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://graph.facebook.com/v19.0/act_123/campaigns',
      expect.objectContaining({
        headers: { Authorization: 'Bearer meta-token' },
        params: { fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time' },
      }),
    );
    expect(result).toEqual([
      {
        externalId: 'campaign-1',
        name: 'Campanha Ativa',
        status: 'ACTIVE',
        objective: null,
        dailyBudget: null,
        startTime: null,
        endTime: null,
      },
      {
        externalId: 'campaign-2',
        name: 'Campanha Removida',
        status: 'ARCHIVED',
        objective: null,
        dailyBudget: null,
        startTime: null,
        endTime: null,
      },
    ]);
  });

  it('sincroniza campaigns sem duplicar por externalId e storeId', async () => {
    const adAccount = {
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
    };
    adAccountRepo.findOne.mockResolvedValue(adAccount);
    jest.spyOn(service, 'fetchCampaignsForAdAccountForUser').mockResolvedValue([
      {
        externalId: 'campaign-1',
        name: 'Campanha Nova',
        status: 'ACTIVE',
        objective: 'LEADS',
        dailyBudget: 120,
        startTime: new Date('2026-04-20T09:00:00Z'),
        endTime: new Date('2026-04-27T22:00:00Z'),
      },
      {
        externalId: 'campaign-2',
        name: 'Campanha Atualizada',
        status: 'PAUSED',
        objective: null,
        dailyBudget: null,
        startTime: null,
        endTime: null,
      },
    ]);
    const existing = {
      id: 'campaign-local-2',
      storeId: 'store-1',
      externalId: 'campaign-2',
      adAccountId: 'old-ad-account',
      name: 'Campanha Antiga',
      status: 'ACTIVE',
      objective: 'TRAFFIC',
      dailyBudget: 75,
      startTime: new Date('2026-04-01T10:00:00Z'),
      endTime: null,
      lastSeenAt: null,
    };
    campaignRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);

    await service.syncCampaignsForAdAccountForUser(user, 'store-1', 'ad-account-1');

    expect(campaignRepo.findOne).toHaveBeenCalledWith({
      where: {
        storeId: 'store-1',
        externalId: 'campaign-1',
      },
    });
    expect(campaignRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      metaId: 'campaign-1',
      externalId: 'campaign-1',
      name: 'Campanha Nova',
      status: 'ACTIVE',
      objective: 'LEADS',
      dailyBudget: 120,
      startTime: new Date('2026-04-20T09:00:00Z'),
      endTime: new Date('2026-04-27T22:00:00Z'),
      storeId: 'store-1',
      adAccountId: 'ad-account-1',
      userId: 'user-1',
      createdByUserId: 'user-1',
    }));
    expect(campaignRepo.create).toHaveBeenCalledTimes(1);
    expect(existing.name).toBe('Campanha Atualizada');
    expect(existing.status).toBe('PAUSED');
    expect(existing.objective).toBe('TRAFFIC');
    expect(existing.dailyBudget).toBe(75);
    expect(existing.startTime).toEqual(new Date('2026-04-01T10:00:00Z'));
    expect(existing.adAccountId).toBe('ad-account-1');
    expect(existing.lastSeenAt).toBeInstanceOf(Date);
  });

  it('cria campanha Meta pausada e persiste no banco interno sem token na resposta', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    }));
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
      syncStatus: SyncStatus.SUCCESS,
      active: true,
    });
    campaignRepo.findOne.mockResolvedValue(null);
    mockedAxios.get
      .mockResolvedValueOnce({ data: { id: 'provider-user-1' } })
      .mockResolvedValueOnce(downloadedImageResponse() as any);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'campaign-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'adset-meta-1' } })
      .mockResolvedValueOnce(metaImageUploadResponse())
      .mockResolvedValueOnce({ data: { id: 'creative-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'ad-meta-1' } });

    const result = await service.createCampaignForUser(user, 'store-1', createCampaignPayload());

    const campaignCall = (mockedAxios.post as jest.Mock).mock.calls.find((call) => String(call[0]).includes('/campaigns'));
    expect(campaignCall).toEqual([
      'https://graph.facebook.com/v19.0/act_123/campaigns',
      expect.any(URLSearchParams),
      expect.any(Object),
    ]);
    const creativeCall = (mockedAxios.post as jest.Mock).mock.calls.find((call) => String(call[0]).includes('/adcreatives'));
    const adSetCall = (mockedAxios.post as jest.Mock).mock.calls.find((call) => String(call[0]).includes('/adsets'));
    expect(creativeCall).toBeDefined();
    expect(adSetCall).toBeDefined();
    const creativeRequest = creativeCall?.[1] as URLSearchParams;
    const adSetRequest = adSetCall?.[1] as URLSearchParams;
    const objectStorySpec = JSON.parse(creativeRequest.get('object_story_spec') as string);
    const targeting = JSON.parse(adSetRequest.get('targeting') as string);
    expect(objectStorySpec.page_id).toBe('page-1');
    expect(String(campaignCall?.[1])).toContain('status=PAUSED');
    expect(String(adSetRequest)).toContain('optimization_goal=LINK_CLICKS');
    expect(String(adSetRequest)).toContain('billing_event=IMPRESSIONS');
    expect(String(adSetRequest)).toContain('daily_budget=2500');
    expect(String(adSetRequest)).toContain('start_time=2026-05-01T09%3A00%3A00.000Z');
    expect(String(adSetRequest)).toContain('end_time=2026-05-08T22%3A00%3A00.000Z');
    expect(targeting.geo_locations).toEqual({ countries: ['BR'] });
    expect(targeting.geo_locations.cities).toBeUndefined();
    expect(String(creativeRequest)).toContain('image_hash');
    expect(objectStorySpec.link_data.call_to_action.type).toBe('LEARN_MORE');
    expect(objectStorySpec.link_data.image_hash).toBe('meta-image-hash-1');
    expect(campaignRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      metaId: 'campaign-meta-1',
      externalId: 'campaign-meta-1',
      name: 'Campanha MVP',
      status: 'PAUSED',
      objective: 'TRAFFIC',
      dailyBudget: 25,
      storeId: 'store-1',
      adAccountId: 'ad-account-1',
      createdByUserId: 'user-1',
      lastSeenAt: expect.any(Date),
    }));
    expect(campaignCreationRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      status: MetaCampaignCreationStatus.IN_PROGRESS,
      payloadHash: expect.any(String),
      requestPayload: expect.objectContaining({
        storeId: 'store-1',
        requesterId: 'user-1',
        adAccountId: 'ad-account-1',
      }),
    }));
    expect(result).toEqual({
      executionId: 'creation-1',
      idempotencyKey: expect.any(String),
      campaignId: 'campaign-meta-1',
      adSetId: 'adset-meta-1',
      creativeId: 'creative-meta-1',
      adId: 'ad-meta-1',
      status: 'CREATED',
      executionStatus: 'COMPLETED',
      initialStatus: 'PAUSED',
      storeId: 'store-1',
      adAccountId: 'ad-account-1',
      platform: 'META',
    });
    expect(result).not.toHaveProperty('accessToken');
  });

  it('aceita assetId e resolve storageUrl do asset sem exigir URL manual', async () => {
    integrationRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    });
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: '123456789',
      metaId: '123456789',
      active: true,
      syncStatus: SyncStatus.SUCCESS,
    });
    campaignRepo.findOne.mockResolvedValue(null);
    mockedAxios.post.mockResolvedValueOnce({ data: { id: 'meta-campaign-1' } } as any);
    mockedAxios.post.mockResolvedValueOnce({ data: { id: 'meta-adset-1' } } as any);
    mockedAxios.post.mockResolvedValueOnce(metaImageUploadResponse() as any);
    mockedAxios.post.mockResolvedValueOnce({ data: { id: 'meta-creative-1' } } as any);
    mockedAxios.post.mockResolvedValueOnce({ data: { id: 'meta-ad-1' } } as any);

    const result = await service.createCampaignForUser(user, 'store-1', createCampaignPayload({
      name: 'Campanha com asset',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 80,
      message: 'Mensagem principal',
      assetId: 'asset-1',
      imageUrl: undefined,
      destinationUrl: 'https://metaiq.dev/oferta',
      headline: 'Headline',
      initialStatus: 'PAUSED',
    }));

    expect(result.status).toBe('CREATED');
    expect(assetsService.getAssetForStore).toHaveBeenCalledWith('store-1', 'asset-1');
  });

  it('envia promoted_object, special_ad_categories e placements reais para campanhas de leads', async () => {
    integrationRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    });
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
      active: true,
      syncStatus: SyncStatus.SUCCESS,
    });
    campaignRepo.findOne.mockResolvedValue(null);
    mockedAxios.get
      .mockResolvedValueOnce({ data: { id: 'provider-user-1' } })
      .mockResolvedValueOnce(downloadedImageResponse() as any);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'campaign-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'adset-meta-1' } })
      .mockResolvedValueOnce(metaImageUploadResponse())
      .mockResolvedValueOnce({ data: { id: 'creative-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'ad-meta-1' } });

    await service.createCampaignForUser(user, 'store-1', createCampaignPayload({
      objective: 'OUTCOME_LEADS',
      pixelId: 'pixel-123',
      conversionEvent: 'Lead',
      placements: ['feed', 'reels', 'messenger'],
      specialAdCategories: ['HOUSING'],
      destinationUrl: 'https://metaiq.dev/oferta',
      utmCampaign: 'leads-q2',
      utmContent: 'hero-1',
      utmTerm: 'crm',
    }));

    const campaignCall = (mockedAxios.post as jest.Mock).mock.calls.find((call) => String(call[0]).includes('/campaigns'));
    const adSetCall = (mockedAxios.post as jest.Mock).mock.calls.find((call) => String(call[0]).includes('/adsets'));
    const creativeCall = (mockedAxios.post as jest.Mock).mock.calls.find((call) => String(call[0]).includes('/adcreatives'));
    const adSetRequest = adSetCall?.[1] as URLSearchParams;
    const creativeRequest = creativeCall?.[1] as URLSearchParams;
    const targeting = JSON.parse(adSetRequest.get('targeting') as string);
    const promotedObject = JSON.parse(adSetRequest.get('promoted_object') as string);
    const objectStorySpec = JSON.parse(creativeRequest.get('object_story_spec') as string);

    expect(String(campaignCall?.[1])).toContain('special_ad_categories=%5B%22HOUSING%22%5D');
    expect(String(adSetRequest)).toContain('optimization_goal=OFFSITE_CONVERSIONS');
    expect(promotedObject).toEqual({ pixel_id: 'pixel-123', custom_event_type: 'LEAD' });
    expect(targeting.publisher_platforms).toEqual(expect.arrayContaining(['facebook', 'instagram', 'messenger']));
    expect(targeting.facebook_positions).toEqual(expect.arrayContaining(['feed', 'facebook_reels']));
    expect(targeting.instagram_positions).toEqual(expect.arrayContaining(['stream', 'reels']));
    expect(targeting.messenger_positions).toEqual(expect.arrayContaining(['messenger_home']));
    expect(objectStorySpec.link_data.link).toContain('utm_source=meta');
    expect(objectStorySpec.link_data.link).toContain('utm_medium=paid-social');
    expect(objectStorySpec.link_data.link).toContain('utm_campaign=leads-q2');
    expect(objectStorySpec.link_data.link).toContain('utm_content=hero-1');
    expect(objectStorySpec.link_data.link).toContain('utm_term=crm');
  });

  it('converte orçamento para centavos e remove cidade IBGE do payload do adset', async () => {
    integrationRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    });
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
      active: true,
      syncStatus: SyncStatus.SUCCESS,
    });
    campaignRepo.findOne.mockResolvedValue(null);
    mockedAxios.get
      .mockResolvedValueOnce({ data: { id: 'provider-user-1' } })
      .mockResolvedValueOnce(downloadedImageResponse() as any);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'campaign-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'adset-meta-1' } })
      .mockResolvedValueOnce(metaImageUploadResponse())
      .mockResolvedValueOnce({ data: { id: 'creative-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'ad-meta-1' } });

    await service.createCampaignForUser(user, 'store-1', createCampaignPayload({
      dailyBudget: 50,
      state: 'PR',
      stateName: 'Paraná',
      city: 'Curitiba',
      cityId: 4106902,
    }));

    const adSetCall = (mockedAxios.post as jest.Mock).mock.calls.find((call) => String(call[0]).includes('/adsets'));
    const adSetRequest = adSetCall?.[1] as URLSearchParams;
    const targeting = JSON.parse(adSetRequest.get('targeting') as string);

    expect(String(adSetRequest)).toContain('daily_budget=5000');
    expect(targeting.geo_locations).toEqual({ countries: ['BR'] });
    expect(targeting.geo_locations.cities).toBeUndefined();
  });

  it('bloqueia campanha de leads sem pixel antes de chamar a Meta', async () => {
    integrationRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    });
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
      syncStatus: SyncStatus.SUCCESS,
      active: true,
    });

    await expect(service.createCampaignForUser(user, 'store-1', createCampaignPayload({
      objective: 'OUTCOME_LEADS',
      pixelId: '',
      conversionEvent: 'Lead',
    }))).rejects.toThrow('Campanhas de leads exigem pixel configurado antes da publicação.');

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('normaliza CTA amigavel da UI antes de enviar o creative para a Meta', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    }));
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
      syncStatus: SyncStatus.SUCCESS,
      active: true,
    });
    campaignRepo.findOne.mockResolvedValue(null);
    mockedAxios.get
      .mockResolvedValueOnce({ data: { id: 'provider-user-1' } })
      .mockResolvedValueOnce(downloadedImageResponse() as any);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'campaign-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'adset-meta-1' } })
      .mockResolvedValueOnce(metaImageUploadResponse())
      .mockResolvedValueOnce({ data: { id: 'creative-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'ad-meta-1' } });

    await service.createCampaignForUser(user, 'store-1', createCampaignPayload({
      name: 'Campanha CTA',
      cta: 'Fale conosco' as any,
    }));

    const creativeCall = (mockedAxios.post as jest.Mock).mock.calls.find((call) => String(call[0]).includes('/adcreatives'));
    expect(creativeCall).toBeDefined();
    const creativeRequest = creativeCall?.[1] as URLSearchParams;
    const objectStorySpec = JSON.parse(creativeRequest.get('object_story_spec') as string);

    expect(objectStorySpec.link_data.call_to_action.type).toBe('CONTACT_US');
    expect(campaignCreationRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      requestPayload: expect.objectContaining({
        cta: 'CONTACT_US',
      }),
    }));
  });

  it('usa page_id da integracao ao montar o creative mesmo quando vier como facebookPageId', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration({
        metadata: { facebookPageId: '1043259782209836', destinationUrl: 'https://www.metaiq.com.br' },
      })),
    }));
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
      syncStatus: SyncStatus.SUCCESS,
      active: true,
    });
    campaignRepo.findOne.mockResolvedValue(null);
    mockedAxios.get
      .mockResolvedValueOnce({ data: { id: 'provider-user-1' } })
      .mockResolvedValueOnce(downloadedImageResponse() as any);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'campaign-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'adset-meta-1' } })
      .mockResolvedValueOnce(metaImageUploadResponse())
      .mockResolvedValueOnce({ data: { id: 'creative-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'ad-meta-1' } });

    await service.createCampaignForUser(user, 'store-1', createCampaignPayload({
      name: 'Pet Shop Tráfego Qualificado - Visitas Curitiba',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 50,
      message: 'Seu pet merece o melhor cuidado! Agende serviços com segurança e conveniência. Clique e saiba mais sobre nossos planos.',
      imageUrl: 'https://picsum.photos/1200/800',
      destinationUrl: 'https://www.metaiq.com.br',
      headline: 'Pet shop com mais confiança',
      description: 'Tráfego com leitura clara de público, oferta e próximo passo.',
      cta: 'LEARN_MORE',
      initialStatus: 'PAUSED',
    }));

    const creativeCall = (mockedAxios.post as jest.Mock).mock.calls.find((call) => String(call[0]).includes('/adcreatives'));
    expect(creativeCall).toBeDefined();
    const creativeRequest = creativeCall?.[1] as URLSearchParams;
    const objectStorySpec = JSON.parse(creativeRequest.get('object_story_spec') as string);

    expect(objectStorySpec.page_id).toBe('1043259782209836');
    expect(objectStorySpec.link_data.link).toContain('https://www.metaiq.com.br/');
    expect(objectStorySpec.link_data.link).toContain('utm_source=meta');
    expect(objectStorySpec.link_data.link).toContain('utm_medium=paid-social');
    expect(objectStorySpec.link_data.name).toBe('Pet shop com mais confiança');
    expect(objectStorySpec.link_data.description).toBe('Tráfego com leitura clara de público, oferta e próximo passo.');
    expect(objectStorySpec.link_data.call_to_action.type).toBe('LEARN_MORE');
  });

  it('bloqueia a criacao antes da Meta quando imageUrl parece ser pagina de preview', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    }));
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
      syncStatus: SyncStatus.SUCCESS,
      active: true,
    });
    campaignRepo.findOne.mockResolvedValue(null);
    mockedAxios.get.mockResolvedValueOnce({ data: { id: 'provider-user-1' } });

    await expect(service.createCampaignForUser(user, 'store-1', createCampaignPayload({
      name: 'Campanha imagem invalida',
      imageUrl: 'https://www.google.com/imgres?imgurl=https://metaiq.dev/image.jpg',
    }))).rejects.toThrow('imageUrl deve apontar para uma imagem direta válida');

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('bloqueia criação de campanha quando AdAccount não pertence à store', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    }));
    mockedAxios.get.mockResolvedValueOnce({ data: { id: 'provider-user-1' } });
    adAccountRepo.findOne.mockResolvedValue(null);

    await expect(service.createCampaignForUser(user, 'store-1', createCampaignPayload({
      adAccountId: 'ad-account-other-store',
    }))).rejects.toThrow('AdAccount Meta não encontrada');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('bloqueia criação de campanha sem pageId configurado na integração', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration({
        metadata: { destinationUrl: 'https://metaiq.dev/oferta' },
      })),
    }));
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
      syncStatus: SyncStatus.SUCCESS,
      active: true,
    });
    mockedAxios.get.mockResolvedValueOnce({ data: { id: 'provider-user-1' } });

    await expect(service.createCampaignForUser(user, 'store-1', createCampaignPayload())).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'pageId é obrigatório para criar o criativo',
        step: 'creative',
      }),
    });
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('bloqueia criação de campanha com destinationUrl inválida antes de chamar a Meta', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration({
        metadata: { pageId: 'page-1', destinationUrl: 'http://metaiq.dev/oferta' },
      })),
    }));
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
      syncStatus: SyncStatus.SUCCESS,
      active: true,
    });
    mockedAxios.get.mockResolvedValueOnce({ data: { id: 'provider-user-1' } });

    await expect(service.createCampaignForUser(user, 'store-1', createCampaignPayload({
      name: 'Campanha com URL invalida',
    }))).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'destination_url inválido. Use uma URL https válida para o criativo.',
      }),
    });

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('retorna etapa e IDs parciais quando falha na criação do creative', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    }));
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
      syncStatus: SyncStatus.SUCCESS,
      active: true,
    });
    mockedAxios.get
      .mockResolvedValueOnce({ data: { id: 'provider-user-1' } })
      .mockResolvedValueOnce(downloadedImageResponse() as any);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'campaign-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'adset-meta-1' } })
      .mockResolvedValueOnce(metaImageUploadResponse())
      .mockRejectedValueOnce({
        response: {
          data: {
            error: {
              code: 100,
              error_subcode: 1815752,
              type: 'OAuthException',
              message: 'Invalid parameter',
              error_user_title: 'Creative inválido',
              error_user_msg: 'Verifique page_id e link_data.',
              fbtrace_id: 'trace-creative-1',
            },
          },
        },
      });

    await expect(service.createCampaignForUser(user, 'store-1', createCampaignPayload())).rejects.toMatchObject({
      response: expect.objectContaining({
        step: 'creative',
        message: expect.stringContaining('Erro na criação do criativo'),
        partialIds: {
          campaignId: 'campaign-meta-1',
          adSetId: 'adset-meta-1',
        },
        hint: expect.stringContaining('Verifique'),
        metaError: expect.objectContaining({
          code: 100,
          subcode: 1815752,
          type: 'OAuthException',
          userTitle: 'Creative inválido',
          userMessage: 'Verifique page_id e link_data.',
          fbtraceId: 'trace-creative-1',
        }),
      }),
    });
    expect(integrationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      lastSyncStatus: SyncStatus.ERROR,
      lastSyncError: expect.stringContaining('META_CAMPAIGN_CREATION_FAILED'),
    }));
    expect(campaignCreationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: MetaCampaignCreationStatus.PARTIAL,
      errorStep: 'creative',
      metaCampaignId: 'campaign-meta-1',
      metaAdSetId: 'adset-meta-1',
    }));
  });

  it('marca execução como FAILED quando falha ao criar campaign', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    }));
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
      syncStatus: SyncStatus.SUCCESS,
      active: true,
    });
    mockedAxios.get
      .mockResolvedValueOnce({ data: { id: 'provider-user-1' } })
      .mockResolvedValueOnce(downloadedImageResponse() as any);
    mockedAxios.post
      .mockRejectedValueOnce({
      response: {
        data: { error: { code: 100, message: 'Campaign inválida' } },
      },
    });

    await expect(service.createCampaignForUser(user, 'store-1', createCampaignPayload({
      idempotencyKey: 'key-campaign-fail',
    }))).rejects.toMatchObject({
      response: expect.objectContaining({
        step: 'campaign',
        executionId: 'creation-1',
        partialIds: {},
        hint: expect.any(String),
      }),
    });
    expect(campaignCreationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: MetaCampaignCreationStatus.FAILED,
      errorStep: 'campaign',
      errorMessage: 'Campaign inválida | code=100',
    }));
  });

  it('marca execução como PARTIAL quando falha ao criar adset', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    }));
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
      syncStatus: SyncStatus.SUCCESS,
      active: true,
    });
    mockedAxios.get
      .mockResolvedValueOnce({ data: { id: 'provider-user-1' } })
      .mockResolvedValueOnce(downloadedImageResponse() as any);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'campaign-meta-1' } })
      .mockRejectedValueOnce({
        response: {
          data: { error: { code: 100, message: 'AdSet inválido' } },
        },
      });

    await expect(service.createCampaignForUser(user, 'store-1', createCampaignPayload())).rejects.toMatchObject({
      response: expect.objectContaining({
        step: 'adset',
        partialIds: { campaignId: 'campaign-meta-1' },
      }),
    });
    expect(campaignCreationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: MetaCampaignCreationStatus.PARTIAL,
      errorStep: 'adset',
      metaCampaignId: 'campaign-meta-1',
    }));
  });

  it('marca execução como PARTIAL quando falha ao criar ad', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    }));
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
      syncStatus: SyncStatus.SUCCESS,
      active: true,
    });
    mockedAxios.get
      .mockResolvedValueOnce({ data: { id: 'provider-user-1' } })
      .mockResolvedValueOnce(downloadedImageResponse() as any);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'campaign-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'adset-meta-1' } })
      .mockResolvedValueOnce(metaImageUploadResponse())
      .mockResolvedValueOnce({ data: { id: 'creative-meta-1' } })
      .mockRejectedValueOnce({
        response: {
          data: { error: { code: 100, message: 'Ad inválido' } },
        },
      });

    await expect(service.createCampaignForUser(user, 'store-1', createCampaignPayload())).rejects.toMatchObject({
      response: expect.objectContaining({
        step: 'ad',
        partialIds: {
          campaignId: 'campaign-meta-1',
          adSetId: 'adset-meta-1',
          creativeId: 'creative-meta-1',
        },
      }),
    });
    expect(campaignCreationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: MetaCampaignCreationStatus.PARTIAL,
      errorStep: 'ad',
      metaCreativeId: 'creative-meta-1',
    }));
  });

  it('marca etapa PERSIST como PARTIAL quando a Meta cria tudo mas o banco falha', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    }));
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
      syncStatus: SyncStatus.SUCCESS,
      active: true,
    });
    campaignRepo.findOne.mockResolvedValue(null);
    campaignRepo.save.mockRejectedValueOnce(new Error('database unavailable'));
    mockedAxios.get
      .mockResolvedValueOnce({ data: { id: 'provider-user-1' } })
      .mockResolvedValueOnce(downloadedImageResponse() as any);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'campaign-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'adset-meta-1' } })
      .mockResolvedValueOnce(metaImageUploadResponse())
      .mockResolvedValueOnce({ data: { id: 'creative-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'ad-meta-1' } });

    await expect(service.createCampaignForUser(user, 'store-1', createCampaignPayload({
      idempotencyKey: 'key-persist-fail',
    }))).rejects.toMatchObject({
      response: expect.objectContaining({
        step: 'persist',
        executionStatus: MetaCampaignCreationStatus.PARTIAL,
        canRetry: true,
        partialIds: {
          campaignId: 'campaign-meta-1',
          adSetId: 'adset-meta-1',
          creativeId: 'creative-meta-1',
          adId: 'ad-meta-1',
        },
      }),
    });
    expect(campaignCreationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: MetaCampaignCreationStatus.PARTIAL,
      errorStep: 'persist',
      metaCampaignId: 'campaign-meta-1',
      metaAdSetId: 'adset-meta-1',
      metaCreativeId: 'creative-meta-1',
      metaAdId: 'ad-meta-1',
      canRetry: true,
    }));
  });

  it('bloqueia corrida de idempotencyKey quando a constraint unica vence a segunda request', async () => {
    campaignCreationRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'creation-running',
        storeId: 'store-1',
        adAccountId: 'ad-account-1',
        idempotencyKey: 'same-key',
        status: MetaCampaignCreationStatus.IN_PROGRESS,
      });
    campaignCreationRepo.save.mockRejectedValueOnce({ code: '23505' });
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    }));
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
      syncStatus: SyncStatus.SUCCESS,
      active: true,
    });
    mockedAxios.get.mockResolvedValueOnce({ data: { id: 'provider-user-1' } });

    await expect(service.createCampaignForUser(user, 'store-1', createCampaignPayload({
      idempotencyKey: 'same-key',
    }))).rejects.toMatchObject({
      response: expect.objectContaining({
        executionId: 'creation-running',
        executionStatus: MetaCampaignCreationStatus.IN_PROGRESS,
        idempotencyKey: 'same-key',
        message: expect.stringContaining('Criação de campanha já registrada'),
      }),
    });
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('retorna resultado anterior quando idempotencyKey já foi concluída', async () => {
    campaignCreationRepo.findOne.mockResolvedValueOnce({
      id: 'creation-done',
      storeId: 'store-1',
      adAccountId: 'ad-account-1',
      idempotencyKey: 'same-key',
      status: MetaCampaignCreationStatus.COMPLETED,
      metaCampaignId: 'campaign-meta-1',
      metaAdSetId: 'adset-meta-1',
      metaCreativeId: 'creative-meta-1',
      metaAdId: 'ad-meta-1',
    });
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    }));
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
      syncStatus: SyncStatus.SUCCESS,
      active: true,
    });
    mockedAxios.get.mockResolvedValueOnce({ data: { id: 'provider-user-1' } });

    const result = await service.createCampaignForUser(user, 'store-1', createCampaignPayload({
      idempotencyKey: 'same-key',
    }));

    expect(result).toEqual(expect.objectContaining({
      executionId: 'creation-done',
      campaignId: 'campaign-meta-1',
      adSetId: 'adset-meta-1',
      creativeId: 'creative-meta-1',
      adId: 'ad-meta-1',
      status: 'CREATED',
    }));
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('rejeita idempotencyKey reutilizada com payload incompatível', async () => {
    campaignCreationRepo.findOne.mockResolvedValueOnce({
      id: 'creation-done',
      storeId: 'store-1',
      adAccountId: 'ad-account-1',
      idempotencyKey: 'same-key',
      status: MetaCampaignCreationStatus.COMPLETED,
      payloadHash: 'hash-de-outra-intencao',
      metaCampaignId: 'campaign-meta-1',
      metaAdSetId: 'adset-meta-1',
      metaCreativeId: 'creative-meta-1',
      metaAdId: 'ad-meta-1',
    });

    await expect(service.createCampaignForUser(user, 'store-1', createCampaignPayload({
      name: 'Campanha diferente',
      dailyBudget: 99,
      message: 'Outra mensagem',
      imageUrl: 'https://metaiq.dev/outra-image.jpg',
      idempotencyKey: 'same-key',
    }))).rejects.toMatchObject({
      response: expect.objectContaining({
        executionId: 'creation-done',
        executionStatus: MetaCampaignCreationStatus.COMPLETED,
        idempotencyKey: 'same-key',
      }),
    });
    expect(integrationRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('bloqueia idempotencyKey repetida em andamento', async () => {
    campaignCreationRepo.findOne.mockResolvedValueOnce({
      id: 'creation-running',
      storeId: 'store-1',
      adAccountId: 'ad-account-1',
      idempotencyKey: 'same-key',
      status: MetaCampaignCreationStatus.IN_PROGRESS,
    });
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    }));
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
      syncStatus: SyncStatus.SUCCESS,
      active: true,
    });
    mockedAxios.get.mockResolvedValueOnce({ data: { id: 'provider-user-1' } });

    await expect(service.createCampaignForUser(user, 'store-1', createCampaignPayload({
      idempotencyKey: 'same-key',
    }))).rejects.toMatchObject({
      response: expect.objectContaining({
        executionId: 'creation-running',
        executionStatus: MetaCampaignCreationStatus.IN_PROGRESS,
        hint: expect.any(String),
      }),
    });
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('orienta uso do recovery quando idempotencyKey aponta para execução parcial', async () => {
    campaignCreationRepo.findOne.mockResolvedValueOnce({
      id: 'creation-partial',
      storeId: 'store-1',
      adAccountId: 'ad-account-1',
      idempotencyKey: 'same-key',
      status: MetaCampaignCreationStatus.PARTIAL,
      errorStep: 'creative',
      errorMessage: 'Invalid parameter',
      payloadHash: 'expected-hash',
      requestPayload: {
        initialStatus: 'PAUSED',
        destinationUrl: 'https://metaiq.dev/oferta',
      },
      metaCampaignId: 'campaign-meta-1',
      metaAdSetId: 'adset-meta-1',
    });
    const hashSpy = jest.spyOn<any, any>(service as any, 'hashPayload').mockReturnValue('expected-hash');

    await expect(service.createCampaignForUser(user, 'store-1', createCampaignPayload({
      idempotencyKey: 'same-key',
    }))).rejects.toMatchObject({
      response: expect.objectContaining({
        executionId: 'creation-partial',
        executionStatus: MetaCampaignCreationStatus.PARTIAL,
        partialIds: {
          campaignId: 'campaign-meta-1',
          adSetId: 'adset-meta-1',
        },
        hint: expect.stringContaining('pageId'),
      }),
    });

    hashSpy.mockRestore();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('bloqueia criação de campanha quando o ad account pertence a outra store', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => connectedCampaignIntegration()),
    }));
    adAccountRepo.findOne.mockResolvedValue({
      id: 'ad-account-1',
      storeId: 'store-2',
      provider: IntegrationProvider.META,
      externalId: 'act_123',
      metaId: 'act_123',
      syncStatus: SyncStatus.SUCCESS,
      active: true,
    });

    await expect(service.createCampaignForUser(user, 'store-1', createCampaignPayload())).rejects.toThrow('AdAccount Meta não encontrada para a store informada');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('bloqueia criação de campanha sem acesso à store', async () => {
    accessScope.validateStoreAccess.mockRejectedValueOnce(new ForbiddenException('Usuário sem acesso à store'));

    await expect(service.createCampaignForUser(user, 'store-1', createCampaignPayload())).rejects.toThrow('Usuário sem acesso à store');
    expect(campaignCreationRepo.save).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('bloqueia criação de campanha quando store não está conectada', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => integration({ status: IntegrationStatus.NOT_CONNECTED })),
    }));

    await expect(service.createCampaignForUser(user, 'store-1', createCampaignPayload())).rejects.toThrow('Store não está conectada à Meta');
    expect(campaignCreationRepo.save).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
