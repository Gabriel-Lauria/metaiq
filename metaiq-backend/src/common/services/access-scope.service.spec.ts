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

  it('filters manager campaigns by tenant and store creator', async () => {
    const service = new AccessScopeService({} as any, {} as any);
    const query = createQuery();

    await service.applyCampaignScope(query, 'campaign', user);

    expect(query.innerJoin).toHaveBeenCalledWith('campaign.store', 'campaign_scopeStore');
    const sql = getWhereSql(query);
    expect(sql).toContain('campaign_scopeStore.tenantId = :scopeTenantId');
    expect(sql).toContain('campaign_scopeStore.deletedAt IS NULL');
    expect(sql).toContain('campaign_scopeStore.createdByUserId = :scopeManagerUserId');
    expect(sql).not.toContain('storeId IS NULL');
    expect(sql).not.toContain('userId = :scopeUserId');
  });

  it('filters manager ad accounts by tenant and store creator', async () => {
    const service = new AccessScopeService({} as any, {} as any);
    const query = createQuery();

    await service.applyAdAccountScope(query, 'adAccount', user);

    expect(query.innerJoin).toHaveBeenCalledWith('adAccount.store', 'adAccount_scopeStore');
    const sql = getWhereSql(query);
    expect(sql).toContain('adAccount_scopeStore.tenantId = :scopeTenantId');
    expect(sql).toContain('adAccount_scopeStore.deletedAt IS NULL');
    expect(sql).toContain('adAccount_scopeStore.createdByUserId = :scopeManagerUserId');
    expect(sql).not.toContain('storeId IS NULL');
    expect(sql).not.toContain('userId = :scopeUserId');
  });

  it('filters manager stores by tenant and store creator', async () => {
    const service = new AccessScopeService({} as any, {} as any);
    const query = createQuery();

    await service.applyStoreScope(query, 'store', user);

    const sql = getWhereSql(query);
    expect(sql).toContain('store.tenantId = :scopeTenantId');
    expect(sql).toContain('store.deletedAt IS NULL');
    expect(sql).toContain('store.createdByUserId = :scopeManagerUserId');
  });

  it('filters manager users by tenant and user creator while keeping self visible', async () => {
    const service = new AccessScopeService({} as any, {} as any);
    const query = createQuery();

    await service.applyUserScope(query, 'user', user);

    const sql = getWhereSql(query);
    expect(sql).toContain('user.tenantId = :scopeTenantId');
    expect(sql).toContain('user.deletedAt IS NULL');
    expect(sql).toContain('(user.createdByUserId = :scopeManagerUserId OR user.id = :scopeManagerUserId)');
  });

  it('denies operational/client users with no allowed stores instead of falling back to userId', async () => {
    const service = new AccessScopeService({} as any, {
      find: jest.fn().mockResolvedValue([]),
    } as any);
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
});
