import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { MetaIntegrationService } from './meta.service';
import { MetaCampaignOrchestrator } from './meta-campaign.orchestrator';
import { MetaGraphApiClient } from './meta-graph-api.client';
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
  let config: ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();

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
        status: MetaCampaignCreationStatus.CREATING,
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
    const campaignOrchestrator = new MetaCampaignOrchestrator(graphApi);

    service = new MetaIntegrationService(
      integrationRepo,
      oauthStateRepo,
      adAccountRepo,
      campaignRepo,
      campaignCreationRepo,
      accessScope,
      config,
      graphApi,
      campaignOrchestrator,
    );
  });

  it('gera state seguro e URL de autorização para a store validada', async () => {
    const result = await service.startOAuth('store-1', user);

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

    await expect(service.startOAuth('store-1', user)).rejects.toThrow('META_APP_ID inválido');
    expect(oauthStateRepo.save).not.toHaveBeenCalled();
  });

  it('bloqueia o connect manual quando a flag dev está desativada', async () => {
    await expect(service.connect('store-1', user, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloqueia o connect manual em produção mesmo com flag ligada', async () => {
    (config.get as jest.Mock).mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        'meta.enableDevConnect': true,
        'app.nodeEnv': 'production',
      };
      return values[key];
    });

    await expect(service.connect('store-1', user, {})).rejects.toBeInstanceOf(ForbiddenException);
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

    const result = await service.getStatus('store-1', user);

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

    const result = await service.fetchAdAccountsForStore('store-1', user);

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

    const result = await service.fetchPagesForStore('store-1', user);

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

    const result = await service.updatePage('store-1', user, { pageId: 'page-1' });

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

    await expect(service.fetchAdAccountsForStore('store-1', user)).rejects.toThrow('Store não está conectada à Meta');
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

    await expect(service.fetchAdAccountsForStore('store-1', user)).rejects.toThrow('Token Meta inválido');
    expect(integrationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: IntegrationStatus.ERROR,
      lastSyncStatus: SyncStatus.ERROR,
      lastSyncError: 'TOKEN_INVALID',
    }));
  });

  it('sincroniza Ad Accounts sem duplicar registros existentes', async () => {
    jest.spyOn(service, 'fetchAdAccountsForStore').mockResolvedValue([
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

    await service.syncAdAccountsForStore('store-1', user);

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

    const result = await service.fetchCampaignsForAdAccount('store-1', 'ad-account-1', user);

    expect(adAccountRepo.findOne).toHaveBeenCalledWith({
      where: {
        id: 'ad-account-1',
        storeId: 'store-1',
        provider: IntegrationProvider.META,
      },
    });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://graph.facebook.com/v19.0/act_123/campaigns',
      expect.objectContaining({
        headers: { Authorization: 'Bearer meta-token' },
        params: { fields: 'id,name,status' },
      }),
    );
    expect(result).toEqual([
      { externalId: 'campaign-1', name: 'Campanha Ativa', status: 'ACTIVE' },
      { externalId: 'campaign-2', name: 'Campanha Removida', status: 'ARCHIVED' },
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
    jest.spyOn(service, 'fetchCampaignsForAdAccount').mockResolvedValue([
      { externalId: 'campaign-1', name: 'Campanha Nova', status: 'ACTIVE' },
      { externalId: 'campaign-2', name: 'Campanha Atualizada', status: 'PAUSED' },
    ]);
    const existing = {
      id: 'campaign-local-2',
      storeId: 'store-1',
      externalId: 'campaign-2',
      adAccountId: 'old-ad-account',
      name: 'Campanha Antiga',
      status: 'ACTIVE',
      lastSeenAt: null,
    };
    campaignRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);

    await service.syncCampaignsForAdAccount('store-1', 'ad-account-1', user);

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
      storeId: 'store-1',
      adAccountId: 'ad-account-1',
      userId: 'user-1',
      createdByUserId: 'user-1',
      dailyBudget: 0,
      objective: 'CONVERSIONS',
    }));
    expect(campaignRepo.create).toHaveBeenCalledTimes(1);
    expect(existing.name).toBe('Campanha Atualizada');
    expect(existing.status).toBe('PAUSED');
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
    mockedAxios.get.mockResolvedValueOnce({ data: { id: 'provider-user-1' } });
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'campaign-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'adset-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'creative-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'ad-meta-1' } });

    const result = await service.createCampaign('store-1', user, {
      name: 'Campanha MVP',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 25,
      country: 'BR',
      adAccountId: 'ad-account-1',
      message: 'Mensagem do anuncio',
      imageUrl: 'https://metaiq.dev/image.jpg',
    });

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'https://graph.facebook.com/v19.0/act_123/campaigns',
      expect.any(URLSearchParams),
      expect.any(Object),
    );
    expect(String((mockedAxios.post as jest.Mock).mock.calls[0][1])).toContain('status=PAUSED');
    expect(String((mockedAxios.post as jest.Mock).mock.calls[1][1])).toContain('optimization_goal=LINK_CLICKS');
    expect(String((mockedAxios.post as jest.Mock).mock.calls[1][1])).toContain('billing_event=IMPRESSIONS');
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
    expect(result).toEqual({
      executionId: 'creation-1',
      idempotencyKey: expect.any(String),
      campaignId: 'campaign-meta-1',
      adSetId: 'adset-meta-1',
      creativeId: 'creative-meta-1',
      adId: 'ad-meta-1',
      status: 'CREATED',
      executionStatus: 'ACTIVE',
      storeId: 'store-1',
      adAccountId: 'ad-account-1',
      platform: 'META',
    });
    expect(result).not.toHaveProperty('accessToken');
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

    await expect(service.createCampaign('store-1', user, {
      name: 'Campanha MVP',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 25,
      country: 'BR',
      adAccountId: 'ad-account-other-store',
      message: 'Mensagem do anuncio',
      imageUrl: 'https://metaiq.dev/image.jpg',
    })).rejects.toThrow('AdAccount Meta não encontrada');
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

    await expect(service.createCampaign('store-1', user, {
      name: 'Campanha MVP',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 25,
      country: 'BR',
      adAccountId: 'ad-account-1',
      message: 'Mensagem do anuncio',
      imageUrl: 'https://metaiq.dev/image.jpg',
    })).rejects.toThrow('Meta pageId é obrigatório');
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
    mockedAxios.get.mockResolvedValueOnce({ data: { id: 'provider-user-1' } });
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'campaign-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'adset-meta-1' } })
      .mockRejectedValueOnce({
        response: {
          data: { error: { code: 100, message: 'Creative inválido' } },
        },
      });

    await expect(service.createCampaign('store-1', user, {
      name: 'Campanha MVP',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 25,
      country: 'BR',
      adAccountId: 'ad-account-1',
      message: 'Mensagem do anuncio',
      imageUrl: 'https://metaiq.dev/image.jpg',
    })).rejects.toMatchObject({
      response: expect.objectContaining({
        step: 'creative',
        partialIds: {
          campaignId: 'campaign-meta-1',
          adSetId: 'adset-meta-1',
        },
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
    mockedAxios.get.mockResolvedValueOnce({ data: { id: 'provider-user-1' } });
    mockedAxios.post.mockRejectedValueOnce({
      response: {
        data: { error: { code: 100, message: 'Campaign inválida' } },
      },
    });

    await expect(service.createCampaign('store-1', user, {
      name: 'Campanha MVP',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 25,
      country: 'BR',
      adAccountId: 'ad-account-1',
      message: 'Mensagem do anuncio',
      imageUrl: 'https://metaiq.dev/image.jpg',
      idempotencyKey: 'key-campaign-fail',
    })).rejects.toMatchObject({
      response: expect.objectContaining({
        step: 'campaign',
        executionId: 'creation-1',
        partialIds: {},
      }),
    });
    expect(campaignCreationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: MetaCampaignCreationStatus.FAILED,
      errorStep: 'campaign',
      errorMessage: 'Campaign inválida',
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
    mockedAxios.get.mockResolvedValueOnce({ data: { id: 'provider-user-1' } });
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'campaign-meta-1' } })
      .mockRejectedValueOnce({
        response: {
          data: { error: { code: 100, message: 'AdSet inválido' } },
        },
      });

    await expect(service.createCampaign('store-1', user, {
      name: 'Campanha MVP',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 25,
      country: 'BR',
      adAccountId: 'ad-account-1',
      message: 'Mensagem do anuncio',
      imageUrl: 'https://metaiq.dev/image.jpg',
    })).rejects.toMatchObject({
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
    mockedAxios.get.mockResolvedValueOnce({ data: { id: 'provider-user-1' } });
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'campaign-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'adset-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'creative-meta-1' } })
      .mockRejectedValueOnce({
        response: {
          data: { error: { code: 100, message: 'Ad inválido' } },
        },
      });

    await expect(service.createCampaign('store-1', user, {
      name: 'Campanha MVP',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 25,
      country: 'BR',
      adAccountId: 'ad-account-1',
      message: 'Mensagem do anuncio',
      imageUrl: 'https://metaiq.dev/image.jpg',
    })).rejects.toMatchObject({
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

  it('marca etapa PERSIST como FAILED quando a Meta cria tudo mas o banco falha', async () => {
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
    mockedAxios.get.mockResolvedValueOnce({ data: { id: 'provider-user-1' } });
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'campaign-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'adset-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'creative-meta-1' } })
      .mockResolvedValueOnce({ data: { id: 'ad-meta-1' } });

    await expect(service.createCampaign('store-1', user, {
      name: 'Campanha MVP',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 25,
      country: 'BR',
      adAccountId: 'ad-account-1',
      message: 'Mensagem do anuncio',
      imageUrl: 'https://metaiq.dev/image.jpg',
      idempotencyKey: 'key-persist-fail',
    })).rejects.toMatchObject({
      response: expect.objectContaining({
        step: 'persist',
        executionStatus: MetaCampaignCreationStatus.FAILED,
        partialIds: {
          campaignId: 'campaign-meta-1',
          adSetId: 'adset-meta-1',
          creativeId: 'creative-meta-1',
          adId: 'ad-meta-1',
        },
      }),
    });
    expect(campaignCreationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: MetaCampaignCreationStatus.FAILED,
      errorStep: 'persist',
      metaCampaignId: 'campaign-meta-1',
      metaAdSetId: 'adset-meta-1',
      metaCreativeId: 'creative-meta-1',
      metaAdId: 'ad-meta-1',
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
        status: MetaCampaignCreationStatus.CREATING,
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

    await expect(service.createCampaign('store-1', user, {
      name: 'Campanha MVP',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 25,
      country: 'BR',
      adAccountId: 'ad-account-1',
      message: 'Mensagem do anuncio',
      imageUrl: 'https://metaiq.dev/image.jpg',
      idempotencyKey: 'same-key',
    })).rejects.toMatchObject({
      response: expect.objectContaining({
        executionId: 'creation-running',
        executionStatus: MetaCampaignCreationStatus.CREATING,
        idempotencyKey: 'same-key',
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
      status: MetaCampaignCreationStatus.ACTIVE,
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

    const result = await service.createCampaign('store-1', user, {
      name: 'Campanha MVP',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 25,
      country: 'BR',
      adAccountId: 'ad-account-1',
      message: 'Mensagem do anuncio',
      imageUrl: 'https://metaiq.dev/image.jpg',
      idempotencyKey: 'same-key',
    });

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

  it('bloqueia idempotencyKey repetida em andamento', async () => {
    campaignCreationRepo.findOne.mockResolvedValueOnce({
      id: 'creation-running',
      storeId: 'store-1',
      adAccountId: 'ad-account-1',
      idempotencyKey: 'same-key',
      status: MetaCampaignCreationStatus.CREATING,
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

    await expect(service.createCampaign('store-1', user, {
      name: 'Campanha MVP',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 25,
      country: 'BR',
      adAccountId: 'ad-account-1',
      message: 'Mensagem do anuncio',
      imageUrl: 'https://metaiq.dev/image.jpg',
      idempotencyKey: 'same-key',
    })).rejects.toMatchObject({
      response: expect.objectContaining({
        executionId: 'creation-running',
        executionStatus: MetaCampaignCreationStatus.CREATING,
      }),
    });
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('bloqueia criação de campanha sem acesso à store', async () => {
    accessScope.validateStoreAccess.mockRejectedValueOnce(new ForbiddenException('Usuário sem acesso à store'));

    await expect(service.createCampaign('store-1', user, {
      name: 'Campanha MVP',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 25,
      country: 'BR',
      adAccountId: 'ad-account-1',
      message: 'Mensagem do anuncio',
      imageUrl: 'https://metaiq.dev/image.jpg',
    })).rejects.toThrow('Usuário sem acesso à store');
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

    await expect(service.createCampaign('store-1', user, {
      name: 'Campanha MVP',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 25,
      country: 'BR',
      adAccountId: 'ad-account-1',
      message: 'Mensagem do anuncio',
      imageUrl: 'https://metaiq.dev/image.jpg',
    })).rejects.toThrow('Store não está conectada à Meta');
    expect(campaignCreationRepo.save).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
