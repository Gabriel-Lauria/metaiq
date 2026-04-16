import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { MetaIntegrationService } from './meta.service';
import { IntegrationProvider, IntegrationStatus, Role, SyncStatus } from '../../../common/enums';
import { AuthenticatedUser } from '../../../common/interfaces';
import { StoreIntegration } from '../store-integration.entity';

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

describe('MetaIntegrationService OAuth', () => {
  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'manager@metaiq.dev',
    role: Role.MANAGER,
    managerId: 'manager-1',
  };

  let service: MetaIntegrationService;
  let integrationRepo: any;
  let oauthStateRepo: any;
  let adAccountRepo: any;
  let campaignRepo: any;
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
      save: jest.fn(async (value) => value),
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
          'meta.oauthScopes': ['ads_read', 'business_management'],
          'meta.enableDevConnect': false,
          'app.nodeEnv': 'test',
          'app.frontendUrl': 'http://localhost:4200',
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    service = new MetaIntegrationService(
      integrationRepo,
      oauthStateRepo,
      adAccountRepo,
      campaignRepo,
      accessScope,
      config,
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
        'meta.oauthScopes': ['ads_read'],
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
        grantedScopes: 'ads_read,business_management',
      })),
    }));

    const result = await service.getStatus('store-1', user);

    expect(result).toEqual(expect.objectContaining({
      storeId: 'store-1',
      grantedScopes: ['ads_read', 'business_management'],
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
      grantedScopes: 'ads_read,business_management',
    }));
  });

  it('busca Ad Accounts reais na Meta usando token salvo e resposta normalizada', async () => {
    integrationRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => integration({
        status: IntegrationStatus.CONNECTED,
        accessToken: 'meta-token',
      })),
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
      getOne: jest.fn(async () => integration({
        status: IntegrationStatus.CONNECTED,
        accessToken: 'meta-token',
      })),
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
});
