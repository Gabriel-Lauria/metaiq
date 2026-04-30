import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { Role } from '../enums';
import { AuthenticatedUser } from '../interfaces';
import { AccessScopeService } from './access-scope.service';

describe('AccessScopeService', () => {
  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@test.com',
    role: Role.MANAGER,
    tenantId: 'tenant-1',
    managerId: 'tenant-1',
  };

  function createQuery() {
    const query = {
      innerJoin: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
    };

    return query as unknown as SelectQueryBuilder<unknown> & {
      innerJoin: jest.Mock;
      andWhere: jest.Mock;
    };
  }

  function getWhereSql(query: { andWhere: jest.Mock }): string {
    return query.andWhere.mock.calls.map(([sql]) => sql).join('\n');
  }

  function createServiceWithRepositories(overrides: {
    storeRepository?: Record<string, unknown>;
    userStoreRepository?: Record<string, unknown>;
    userRepository?: Record<string, unknown>;
    campaignRepository?: Record<string, unknown>;
    adAccountRepository?: Record<string, unknown>;
    insightRepository?: Record<string, unknown>;
  } = {}) {
    const campaignRepository = overrides.campaignRepository ?? { findOne: jest.fn() };
    const adAccountRepository = overrides.adAccountRepository ?? { findOne: jest.fn() };
    const insightRepository = overrides.insightRepository ?? { findOne: jest.fn() };
    const storeRepository = {
      findOne: jest.fn(),
      manager: {
        getRepository: jest.fn((entity) => {
          if (entity?.name === 'Campaign') return campaignRepository;
          if (entity?.name === 'AdAccount') return adAccountRepository;
          if (entity?.name === 'Insight') return insightRepository;
          return { findOne: jest.fn() };
        }),
      },
      ...(overrides.storeRepository ?? {}),
    };
    const userStoreRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      ...(overrides.userStoreRepository ?? {}),
    };
    const userRepository = {
      findOne: jest.fn(),
      ...(overrides.userRepository ?? {}),
    };

    return {
      service: new AccessScopeService(
        storeRepository as any,
        userStoreRepository as any,
        userRepository as any,
        {} as any,
      ),
      storeRepository,
      userStoreRepository,
      userRepository,
      campaignRepository,
      adAccountRepository,
      insightRepository,
    };
  }

  it('filters manager campaigns by tenant-owned stores', async () => {
    const service = new AccessScopeService({} as any, {} as any, {} as any, {} as any);
    const query = createQuery();

    await service.applyCampaignScope(query, 'campaign', user);

    expect(query.innerJoin).toHaveBeenCalledWith('campaign.store', 'campaign_scopeStore');
    const sql = getWhereSql(query);
    expect(sql).toContain('campaign_scopeStore.tenantId = :scopeTenantId');
    expect(sql).toContain('campaign_scopeStore.deletedAt IS NULL');
    expect(sql).not.toContain('storeId IS NULL');
    expect(sql).not.toContain('userId = :scopeUserId');
  });

  it('filters manager ad accounts by tenant-owned stores', async () => {
    const service = new AccessScopeService({} as any, {} as any, {} as any, {} as any);
    const query = createQuery();

    await service.applyAdAccountScope(query, 'adAccount', user);

    expect(query.innerJoin).toHaveBeenCalledWith('adAccount.store', 'adAccount_scopeStore');
    const sql = getWhereSql(query);
    expect(sql).toContain('adAccount_scopeStore.tenantId = :scopeTenantId');
    expect(sql).toContain('adAccount_scopeStore.deletedAt IS NULL');
    expect(sql).not.toContain('storeId IS NULL');
    expect(sql).not.toContain('userId = :scopeUserId');
  });

  it('filters manager stores by tenant', async () => {
    const service = new AccessScopeService({} as any, {} as any, {} as any, {} as any);
    const query = createQuery();

    await service.applyStoreScope(query, 'store', user);

    const sql = getWhereSql(query);
    expect(sql).toContain('store.tenantId = :scopeTenantId');
    expect(sql).toContain('store.deletedAt IS NULL');
  });

  it('filters manager users by tenant', async () => {
    const service = new AccessScopeService({} as any, {} as any, {} as any, {} as any);
    const query = createQuery();

    await service.applyUserScope(query, 'user', user);

    const sql = getWhereSql(query);
    expect(sql).toContain('user.tenantId = :scopeTenantId');
    expect(sql).toContain('user.deletedAt IS NULL');
  });

  it('denies operational/client users with no allowed stores instead of falling back to userId', async () => {
    const service = new AccessScopeService({} as any, {
      find: jest.fn().mockResolvedValue([]),
    } as any, {} as any, {} as any);
    const query = createQuery();

    await service.applyCampaignScope(query, 'campaign', {
      ...user,
      role: Role.OPERATIONAL,
    });

    const sql = getWhereSql(query);
    expect(sql).toBe('1 = 0');
    expect(sql).not.toContain('storeId IS NULL');
    expect(sql).not.toContain('userId = :scopeUserId');
  });

  it('allows manager access to a campaign based on tenant store ownership, not createdByUserId', async () => {
    const { service, campaignRepository } = createServiceWithRepositories({
      campaignRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 'campaign-1',
          storeId: 'store-1',
          createdByUserId: 'another-user',
          store: {
            id: 'store-1',
            tenantId: 'tenant-1',
            active: true,
            deletedAt: null,
          },
          adAccount: {
            id: 'ad-account-1',
            storeId: 'store-1',
          },
        }),
      },
    });

    await expect(service.validateCampaignAccess(user, 'campaign-1')).resolves.toMatchObject({
      id: 'campaign-1',
      createdByUserId: 'another-user',
    });
    expect(campaignRepository.findOne).toHaveBeenCalled();
  });

  it('forbids manager access to a store outside the tenant when the store exists', async () => {
    const { service } = createServiceWithRepositories({
      storeRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 'store-2',
          tenantId: 'tenant-2',
          active: true,
          deletedAt: null,
        }),
      },
    });

    await expect(service.validateStoreAccess(user, 'store-2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('forbids operational access to an ad account when the store is not linked', async () => {
    const { service } = createServiceWithRepositories({
      adAccountRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 'ad-account-2',
          storeId: 'store-2',
          provider: 'META',
          store: {
            id: 'store-2',
            tenantId: 'tenant-1',
            active: true,
            deletedAt: null,
          },
        }),
      },
      userStoreRepository: {
        findOne: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(
      service.validateAdAccountAccess(
        { ...user, role: Role.OPERATIONAL },
        'ad-account-2',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an ad account that belongs to a different store even inside the same tenant', async () => {
    const { service } = createServiceWithRepositories({
      storeRepository: {
        findOne: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'store-1',
            tenantId: 'tenant-1',
            active: true,
            deletedAt: null,
          })
          .mockResolvedValueOnce({
            id: 'store-2',
            tenantId: 'tenant-1',
            active: true,
            deletedAt: null,
          }),
      },
      adAccountRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 'ad-account-2',
          storeId: 'store-2',
          provider: 'META',
          store: {
            id: 'store-2',
            tenantId: 'tenant-1',
            active: true,
            deletedAt: null,
          },
        }),
      },
    });

    await expect(
      service.validateAdAccountInStoreAccess(user, 'store-1', 'ad-account-2'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a campaign whose ad account does not match the requested hierarchy', async () => {
    const { service } = createServiceWithRepositories({
      storeRepository: {
        findOne: jest
          .fn()
          .mockResolvedValue({
            id: 'store-1',
            tenantId: 'tenant-1',
            active: true,
            deletedAt: null,
          }),
      },
      adAccountRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 'ad-account-1',
          storeId: 'store-1',
          provider: 'META',
          store: {
            id: 'store-1',
            tenantId: 'tenant-1',
            active: true,
            deletedAt: null,
          },
        }),
      },
      campaignRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 'campaign-1',
          storeId: 'store-1',
          adAccountId: 'ad-account-2',
          store: {
            id: 'store-1',
            tenantId: 'tenant-1',
            active: true,
            deletedAt: null,
          },
          adAccount: {
            id: 'ad-account-2',
            storeId: 'store-1',
          },
        }),
      },
    });

    await expect(
      service.validateCampaignInAdAccountAccess(
        user,
        'store-1',
        'ad-account-1',
        'campaign-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps platform admin with unrestricted access to any user in the system', async () => {
    const { service } = createServiceWithRepositories({
      userRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 'user-99',
          tenantId: 'tenant-99',
          deletedAt: null,
        }),
      },
    });

    await expect(
      service.validateUserAccess(
        { ...user, role: Role.PLATFORM_ADMIN, tenantId: null as any },
        'user-99',
      ),
    ).resolves.toMatchObject({ id: 'user-99' });
  });

  it('returns not found when a campaign does not exist', async () => {
    const { service } = createServiceWithRepositories({
      campaignRepository: {
        findOne: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(service.validateCampaignAccess(user, 'missing-campaign')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
