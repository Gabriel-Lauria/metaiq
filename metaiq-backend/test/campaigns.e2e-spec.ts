import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Role } from '../src/common/enums';
import { User } from '../src/modules/users/user.entity';
import { Manager } from '../src/modules/managers/manager.entity';
import { Tenant } from '../src/modules/tenants/tenant.entity';
import { Store } from '../src/modules/stores/store.entity';
import { UserStore } from '../src/modules/user-stores/user-store.entity';
import { AdAccount } from '../src/modules/ad-accounts/ad-account.entity';
import { Campaign } from '../src/modules/campaigns/campaign.entity';
import { MetricDaily } from '../src/modules/metrics/metric-daily.entity';
import { Insight } from '../src/modules/insights/insight.entity';
import { StoreIntegration } from '../src/modules/integrations/store-integration.entity';
import { IntegrationStatus } from '../src/common/enums';
import { MetricsService } from '../src/modules/metrics/metrics.service';

jest.setTimeout(60000);

describe('Current tenant/store security E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userRepo: Repository<User>;
  let managerRepo: Repository<Manager>;
  let tenantRepo: Repository<Tenant>;
  let storeRepo: Repository<Store>;
  let userStoreRepo: Repository<UserStore>;
  let adAccountRepo: Repository<AdAccount>;
  let campaignRepo: Repository<Campaign>;
  let metricRepo: Repository<MetricDaily>;
  let insightRepo: Repository<Insight>;
  let integrationRepo: Repository<StoreIntegration>;
  let metricsService: MetricsService;

  const runId = `e2e_${Date.now()}`;
  const password = 'Test@1234';
  const range = 'from=2026-01-01&to=2026-12-31';

  type TestUserKey = Role | 'TENANT_ADMIN' | 'MANAGER_B' | 'OPERATIONAL_UNLINKED' | 'INACTIVE' | 'SOFT_DELETED';

  const users: Partial<Record<TestUserKey, User>> = {};
  const tokens: Partial<Record<Role, string>> = {};
  const managers: Manager[] = [];
  const stores: Store[] = [];
  const adAccounts: AdAccount[] = [];
  const campaigns: Campaign[] = [];
  let insightA: Insight;
  let insightB: Insight;
  let tenantAdminToken: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_ENABLE_PUBLIC_REGISTER = 'false';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
    process.env.CRYPTO_SECRET = process.env.CRYPTO_SECRET || 'test-crypto-secret';
    process.env.META_APP_ID = process.env.META_APP_ID || '123456789012345';
    process.env.META_APP_SECRET = process.env.META_APP_SECRET || 'test-meta-secret';
    process.env.META_REDIRECT_URI =
      process.env.META_REDIRECT_URI || 'http://localhost:3004/api/integrations/meta/oauth/callback';
    process.env.META_OAUTH_SCOPES = process.env.META_OAUTH_SCOPES || 'ads_read,ads_management,business_management';
    process.env.AUTH_ENABLE_DEV_META_CONNECT = 'false';

    if (process.env.E2E_DB_TYPE === 'postgres') {
      process.env.DB_TYPE = 'postgres';
      process.env.TYPEORM_SYNCHRONIZE = 'false';
      process.env.TYPEORM_MIGRATIONS_RUN = 'true';
    } else {
      process.env.DB_TYPE = 'sqlite';
      process.env.DATABASE_TYPE = 'sqlite';
      process.env.SQLITE_PATH = ':memory:';
      process.env.TYPEORM_SYNCHRONIZE = 'true';
      process.env.TYPEORM_MIGRATIONS_RUN = 'false';
    }

    const { AppModule } = await import('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    userRepo = dataSource.getRepository(User);
    managerRepo = dataSource.getRepository(Manager);
    tenantRepo = dataSource.getRepository(Tenant);
    storeRepo = dataSource.getRepository(Store);
    userStoreRepo = dataSource.getRepository(UserStore);
    adAccountRepo = dataSource.getRepository(AdAccount);
    campaignRepo = dataSource.getRepository(Campaign);
    metricRepo = dataSource.getRepository(MetricDaily);
    insightRepo = dataSource.getRepository(Insight);
    integrationRepo = dataSource.getRepository(StoreIntegration);
    metricsService = app.get(MetricsService);

    await cleanup();
    await seedTenantGraph();
    await loginAllActiveUsers();
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  async function cleanup() {
    if (!dataSource?.isInitialized) return;

    const campaignMetaIds = [`${runId}_campaign_a`, `${runId}_campaign_b`];
    const adAccountMetaIds = [`${runId}_ad_a`, `${runId}_ad_b`, `${runId}_ad_inactive`];
    const emails = [
      `${runId}.admin@test.com`,
      `${runId}.tenant-admin@test.com`,
      `${runId}.manager@test.com`,
      `${runId}.operational@test.com`,
      `${runId}.operational-unlinked@test.com`,
      `${runId}.client@test.com`,
      `${runId}.managerb@test.com`,
      `${runId}.inactive@test.com`,
      `${runId}.soft-deleted@test.com`,
      `${runId}.created-operational@test.com`,
    ];
    const storeNames = [`${runId} Store A`, `${runId} Store B`, `${runId} Store Created`, `${runId} Store Edited`];
    const managerNames = [`${runId} Manager A`, `${runId} Manager B`, `${runId} Manager Created`];

    const existingStores = await storeRepo.find({
      where: storeNames.map((name) => ({ name })),
      select: ['id'],
    });
    const storeIds = existingStores.map((store) => store.id);
    if (storeIds.length) {
      await integrationRepo
        .createQueryBuilder()
        .delete()
        .where('"storeId" IN (:...storeIds)', { storeIds })
        .execute();
    }

    const existingCampaigns = await campaignRepo.find({
      where: campaignMetaIds.map((metaId) => ({ metaId })),
      select: ['id'],
    });
    const campaignIds = existingCampaigns.map((campaign) => campaign.id);
    if (campaignIds.length) {
      await insightRepo
        .createQueryBuilder()
        .delete()
        .where('"campaignId" IN (:...campaignIds)', { campaignIds })
        .execute();
      await metricRepo
        .createQueryBuilder()
        .delete()
        .where('"campaignId" IN (:...campaignIds)', { campaignIds })
        .execute();
      await campaignRepo.delete(campaignIds);
    }

    await adAccountRepo.delete(adAccountMetaIds.map((metaId) => ({ metaId })));
    await userStoreRepo
      .createQueryBuilder()
      .delete()
      .where('"userId" IN (SELECT id FROM users WHERE email IN (:...emails))', { emails })
      .orWhere('"storeId" IN (SELECT id FROM stores WHERE name IN (:...storeNames))', { storeNames })
      .execute();
    await userRepo.delete(emails.map((email) => ({ email })));
    await storeRepo.delete(storeNames.map((name) => ({ name })));
    await managerRepo.delete(managerNames.map((name) => ({ name })));
    const tenantIds = managers.map((manager) => manager.id);
    if (tenantIds.length) {
      await tenantRepo.delete(tenantIds.map((id) => ({ id })));
    }
    managers.length = 0;
    stores.length = 0;
    adAccounts.length = 0;
    campaigns.length = 0;
  }

  async function seedTenantGraph() {
    const passwordHash = await bcrypt.hash(password, 12);

    const managerA = await managerRepo.save(
      managerRepo.create({ name: `${runId} Manager A`, active: true }),
    );
    const managerB = await managerRepo.save(
      managerRepo.create({ name: `${runId} Manager B`, active: true }),
    );
    managers.push(managerA, managerB);
    await tenantRepo.save([
      tenantRepo.create({ id: managerA.id, name: managerA.name }),
      tenantRepo.create({ id: managerB.id, name: managerB.name }),
    ]);

    const storeA = await storeRepo.save(
      storeRepo.create({ name: `${runId} Store A`, managerId: managerA.id, tenantId: managerA.id, active: true }),
    );
    const storeB = await storeRepo.save(
      storeRepo.create({ name: `${runId} Store B`, managerId: managerB.id, tenantId: managerB.id, active: true }),
    );
    stores.push(storeA, storeB);

    users[Role.ADMIN] = await userRepo.save(
      userRepo.create({
        email: `${runId}.admin@test.com`,
        name: 'E2E Admin',
        password: passwordHash,
        role: Role.PLATFORM_ADMIN,
        managerId: null,
        tenantId: null,
        active: true,
      }),
    );
    users[Role.MANAGER] = await userRepo.save(
      userRepo.create({
        email: `${runId}.manager@test.com`,
        name: 'E2E Manager A',
        password: passwordHash,
        role: Role.MANAGER,
        managerId: managerA.id,
        tenantId: managerA.id,
        active: true,
      }),
    );
    users.TENANT_ADMIN = await userRepo.save(
      userRepo.create({
        email: `${runId}.tenant-admin@test.com`,
        name: 'E2E Tenant Admin A',
        password: passwordHash,
        role: Role.ADMIN,
        managerId: managerA.id,
        tenantId: managerA.id,
        active: true,
      }),
    );
    users[Role.OPERATIONAL] = await userRepo.save(
      userRepo.create({
        email: `${runId}.operational@test.com`,
        name: 'E2E Operational A',
        password: passwordHash,
        role: Role.OPERATIONAL,
        managerId: managerA.id,
        tenantId: managerA.id,
        active: true,
      }),
    );
    users[Role.CLIENT] = await userRepo.save(
      userRepo.create({
        email: `${runId}.client@test.com`,
        name: 'E2E Client A',
        password: passwordHash,
        role: Role.CLIENT,
        managerId: managerA.id,
        tenantId: managerA.id,
        active: true,
      }),
    );
    users.OPERATIONAL_UNLINKED = await userRepo.save(
      userRepo.create({
        email: `${runId}.operational-unlinked@test.com`,
        name: 'E2E Operational Unlinked',
        password: passwordHash,
        role: Role.OPERATIONAL,
        managerId: managerA.id,
        tenantId: managerA.id,
        active: true,
      }),
    );
    users.INACTIVE = await userRepo.save(
      userRepo.create({
        email: `${runId}.inactive@test.com`,
        name: 'E2E Inactive',
        password: passwordHash,
        role: Role.OPERATIONAL,
        managerId: managerA.id,
        tenantId: managerA.id,
        active: false,
      }),
    );
    users.SOFT_DELETED = await userRepo.save(
      userRepo.create({
        email: `${runId}.soft-deleted@test.com`,
        name: 'E2E Soft Deleted A',
        password: passwordHash,
        role: Role.OPERATIONAL,
        managerId: managerA.id,
        tenantId: managerA.id,
        active: true,
        deletedAt: new Date(),
      }),
    );
    users.MANAGER_B = await userRepo.save(
      userRepo.create({
        email: `${runId}.managerb@test.com`,
        name: 'E2E Manager B',
        password: passwordHash,
        role: Role.MANAGER,
        managerId: managerB.id,
        tenantId: managerB.id,
        active: true,
      }),
    );

    await userStoreRepo.save([
      userStoreRepo.create({ userId: users[Role.OPERATIONAL]!.id, storeId: storeA.id }),
      userStoreRepo.create({ userId: users[Role.CLIENT]!.id, storeId: storeA.id }),
    ]);

    const adAccountA = await adAccountRepo.save(
      adAccountRepo.create({
        metaId: `${runId}_ad_a`,
        name: 'E2E Ad Account A',
        currency: 'BRL',
        accessToken: 'test-secret-token-a',
        userId: users[Role.MANAGER]!.id,
        storeId: storeA.id,
        active: true,
      }),
    );
    const adAccountB = await adAccountRepo.save(
      adAccountRepo.create({
        metaId: `${runId}_ad_b`,
        name: 'E2E Ad Account B',
        currency: 'BRL',
        accessToken: 'test-secret-token-b',
        userId: users.MANAGER_B!.id,
        storeId: storeB.id,
        active: true,
      }),
    );
    const inactiveAdAccount = await adAccountRepo.save(
      adAccountRepo.create({
        metaId: `${runId}_ad_inactive`,
        name: 'E2E Inactive Ad Account A',
        currency: 'BRL',
        accessToken: 'test-secret-token-inactive',
        userId: users[Role.MANAGER]!.id,
        storeId: storeA.id,
        active: false,
      }),
    );
    adAccounts.push(adAccountA, adAccountB, inactiveAdAccount);

    const campaignA = await campaignRepo.save(
      campaignRepo.create({
        metaId: `${runId}_campaign_a`,
        name: 'E2E Campaign A',
        status: 'ACTIVE',
        objective: 'CONVERSIONS',
        dailyBudget: 100,
        score: 80,
        startTime: new Date('2026-01-01'),
        userId: users[Role.MANAGER]!.id,
        createdByUserId: users[Role.MANAGER]!.id,
        storeId: storeA.id,
        adAccountId: adAccountA.id,
      }),
    );
    const campaignB = await campaignRepo.save(
      campaignRepo.create({
        metaId: `${runId}_campaign_b`,
        name: 'E2E Campaign B',
        status: 'ACTIVE',
        objective: 'REACH',
        dailyBudget: 200,
        score: 40,
        startTime: new Date('2026-01-01'),
        userId: users.MANAGER_B!.id,
        createdByUserId: users.MANAGER_B!.id,
        storeId: storeB.id,
        adAccountId: adAccountB.id,
      }),
    );
    campaigns.push(campaignA, campaignB);

    await metricRepo.save([
      metricRepo.create({
        campaignId: campaignA.id,
        date: '2026-04-01',
        impressions: 1000,
        clicks: 100,
        spend: 10,
        conversions: 5,
        revenue: 50,
        ctr: 10,
        cpa: 2,
        roas: 5,
      }),
      metricRepo.create({
        campaignId: campaignB.id,
        date: '2026-04-01',
        impressions: 9999,
        clicks: 999,
        spend: 9999,
        conversions: 99,
        revenue: 99999,
        ctr: 9.99,
        cpa: 99,
        roas: 10,
      }),
    ]);

    insightA = await insightRepo.save(
      insightRepo.create({
        campaignId: campaignA.id,
        type: 'opportunity',
        severity: 'success',
        message: 'E2E insight A',
        recommendation: 'Scale campaign A',
        resolved: false,
        priority: 'low',
        cooldownInHours: 24,
        ruleVersion: 1,
      }),
    );
    insightB = await insightRepo.save(
      insightRepo.create({
        campaignId: campaignB.id,
        type: 'alert',
        severity: 'danger',
        message: 'E2E insight B',
        recommendation: 'Fix campaign B',
        resolved: false,
        priority: 'high',
        cooldownInHours: 4,
        ruleVersion: 1,
      }),
    );
  }

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return response.body.accessToken as string;
  }

  async function loginAllActiveUsers() {
    tokens[Role.ADMIN] = await login(users[Role.ADMIN]!.email);
    tokens[Role.MANAGER] = await login(users[Role.MANAGER]!.email);
    tokens[Role.OPERATIONAL] = await login(users[Role.OPERATIONAL]!.email);
    tokens[Role.CLIENT] = await login(users[Role.CLIENT]!.email);
    tokens[Role.PLATFORM_ADMIN] = tokens[Role.ADMIN];
    tenantAdminToken = await login(users.TENANT_ADMIN!.email);
  }

  describe('auth', () => {
    it('logs in, refreshes tokens, exposes users/me, and blocks invalid or inactive users', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: users[Role.ADMIN]!.email, password: 'wrong-password' })
        .expect(401);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: users.INACTIVE!.email, password })
        .expect(401);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: users[Role.ADMIN]!.email, password })
        .expect(200);

      const setCookie = loginResponse.headers['set-cookie'];
      const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
      const refreshCookie = cookies.find((cookie: string) =>
        cookie.startsWith('metaiq_refresh_token='),
      );
      expect(refreshCookie).toBeTruthy();

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie as string)
        .send({})
        .expect(200);

      const me = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${tokens[Role.ADMIN]}`)
        .expect(200);
      expect(me.body.email).toBe(users[Role.ADMIN]!.email);
      expect(me.body).not.toHaveProperty('password');
    });
  });

  describe('stores and users by role', () => {
    it('restricts global manager endpoints to platform admin only', async () => {
      await request(app.getHttpServer())
        .get('/api/managers')
        .set('Authorization', `Bearer ${tenantAdminToken}`)
        .expect(403);

      const platformManagers = await request(app.getHttpServer())
        .get('/api/managers')
        .set('Authorization', `Bearer ${tokens[Role.PLATFORM_ADMIN]}`)
        .expect(200);

      expect(platformManagers.body.map((manager: Manager) => manager.id)).toEqual(
        expect.arrayContaining([managers[0].id, managers[1].id]),
      );
    });

    it('scopes dashboard user counts and ignores soft-deleted users', async () => {
      const tenantSummary = await request(app.getHttpServer())
        .get('/api/dashboard/summary?days=90')
        .set('Authorization', `Bearer ${tenantAdminToken}`)
        .expect(200);

      expect(tenantSummary.body.counts.users).toBe(5);
      expect(tenantSummary.body.counts.campaigns).toBe(1);
      expect(tenantSummary.body.counts.activeCampaigns).toBe(1);
      expect(tenantSummary.body.metrics.spend).toBe(10);
      expect(tenantSummary.body.metrics.revenue).toBe(50);
      expect(tenantSummary.body.highlights.campaigns.map((campaign: Campaign) => campaign.id)).toEqual([
        campaigns[0].id,
      ]);
      expect(tenantSummary.body.insights.map((insight: Insight) => insight.id)).toEqual([insightA.id]);

      const platformSummary = await request(app.getHttpServer())
        .get('/api/dashboard/summary?days=90')
        .set('Authorization', `Bearer ${tokens[Role.PLATFORM_ADMIN]}`)
        .expect(200);

      expect(platformSummary.body.counts.users).toBe(7);
      expect(platformSummary.body.counts.campaigns).toBe(2);
      expect(platformSummary.body.counts.activeCampaigns).toBe(2);
      expect(platformSummary.body.metrics.spend).toBe(10009);
      expect(platformSummary.body.metrics.revenue).toBe(100049);
    });

    it('keeps direct HTTP user listing and lookup scoped to the tenant admin tenant', async () => {
      const tenantUsers = await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${tenantAdminToken}`)
        .expect(200);

      const tenantUserIds = tenantUsers.body.map((user: User) => user.id);
      expect(tenantUserIds).toEqual(
        expect.arrayContaining([
          users.TENANT_ADMIN!.id,
          users[Role.MANAGER]!.id,
          users[Role.OPERATIONAL]!.id,
          users[Role.CLIENT]!.id,
        ]),
      );
      expect(tenantUserIds).not.toContain(users[Role.ADMIN]!.id);
      expect(tenantUserIds).not.toContain(users.MANAGER_B!.id);
      expect(tenantUserIds).not.toContain(users.SOFT_DELETED!.id);

      await request(app.getHttpServer())
        .get(`/api/users/${users.MANAGER_B!.id}`)
        .set('Authorization', `Bearer ${tenantAdminToken}`)
        .expect(403);
    });

    it('returns accessible stores by role and blocks cross-tenant store access', async () => {
      const adminStores = await request(app.getHttpServer())
        .get('/api/stores/accessible')
        .set('Authorization', `Bearer ${tokens[Role.ADMIN]}`)
        .expect(200);
      expect(adminStores.body.map((store: Store) => store.id)).toEqual(
        expect.arrayContaining([stores[0].id, stores[1].id]),
      );

      const managerStores = await request(app.getHttpServer())
        .get('/api/stores/accessible')
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .expect(200);
      expect(managerStores.body.map((store: Store) => store.id)).toEqual([stores[0].id]);

      const operationalStores = await request(app.getHttpServer())
        .get('/api/stores/accessible')
        .set('Authorization', `Bearer ${tokens[Role.OPERATIONAL]}`)
        .expect(200);
      expect(operationalStores.body.map((store: Store) => store.id)).toEqual([stores[0].id]);

      await request(app.getHttpServer())
        .get(`/api/stores/${stores[1].id}`)
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .expect(403);
    });

    it('allows admin management and manager user-store linking within tenant', async () => {
      const createdManager = await request(app.getHttpServer())
        .post('/api/managers')
        .set('Authorization', `Bearer ${tokens[Role.ADMIN]}`)
        .send({ name: `${runId} Manager Created` })
        .expect(201);

      const createdStore = await request(app.getHttpServer())
        .post('/api/stores')
        .set('Authorization', `Bearer ${tokens[Role.ADMIN]}`)
        .send({ name: `${runId} Store Created`, managerId: createdManager.body.id })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/stores/${createdStore.body.id}`)
        .set('Authorization', `Bearer ${tokens[Role.ADMIN]}`)
        .send({ name: `${runId} Store Edited` })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/stores/${stores[0].id}`)
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .expect(409);

      await request(app.getHttpServer())
        .delete(`/api/stores/${createdStore.body.id}`)
        .set('Authorization', `Bearer ${tokens[Role.ADMIN]}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/stores/${createdStore.body.id}`)
        .set('Authorization', `Bearer ${tokens[Role.ADMIN]}`)
        .expect(404);

      const storesAfterDelete = await request(app.getHttpServer())
        .get('/api/stores')
        .set('Authorization', `Bearer ${tokens[Role.ADMIN]}`)
        .expect(200);
      expect(storesAfterDelete.body.map((store: Store) => store.id)).not.toContain(createdStore.body.id);

      const createdUser = await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .send({
          email: `${runId}.created-operational@test.com`,
          password,
          name: 'Created Operational',
          role: Role.OPERATIONAL,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/stores/${stores[0].id}/users/${createdUser.body.id}`)
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .expect(201);
    });
  });

  describe('campaigns, ad accounts, metrics, insights, and dashboards', () => {
    it('rejects campaign and ad account creation without storeId', async () => {
      await request(app.getHttpServer())
        .post('/api/ad-accounts')
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .send({
          metaId: `${runId}_ad_without_store`,
          name: 'Ad Account Without Store',
          currency: 'BRL',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${tokens[Role.OPERATIONAL]}`)
        .send({
          metaId: `${runId}_campaign_without_store`,
          name: 'Campaign Without Store',
          status: 'ACTIVE',
          objective: 'CONVERSIONS',
          dailyBudget: 50,
          startTime: '2026-04-01',
          adAccountId: adAccounts[0].id,
        })
        .expect(400);
    });

    it('blocks campaign creation when the selected ad account is inactive', async () => {
      await request(app.getHttpServer())
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${tokens[Role.OPERATIONAL]}`)
        .send({
          metaId: `${runId}_campaign_inactive_ad_account`,
          name: 'Blocked inactive ad account campaign',
          status: 'ACTIVE',
          objective: 'CONVERSIONS',
          dailyBudget: 50,
          startTime: '2026-04-01',
          storeId: stores[0].id,
          adAccountId: adAccounts[2].id,
        })
        .expect(403);
    });

    it('rejects invalid metric identifiers and date ranges before querying data', async () => {
      await request(app.getHttpServer())
        .get('/api/metrics?campaignId=not-a-uuid')
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .expect(400);

      await request(app.getHttpServer())
        .get('/api/metrics/summary?from=invalid-date&to=2026-12-31')
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .expect(400);

      await request(app.getHttpServer())
        .get('/api/metrics/summary?from=2026-12-31&to=2026-01-01')
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .expect(400);

      await request(app.getHttpServer())
        .get(`/api/metrics/campaigns/not-a-uuid?${range}`)
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .expect(400);
    });

    it('upserts one metric per campaign and date atomically', async () => {
      await metricsService.upsertDailyMetric({
        campaignId: campaigns[0].id,
        date: '2020-04-02',
        impressions: 100,
        clicks: 10,
        spend: 10,
        conversions: 1,
        revenue: 20,
      });

      const updated = await metricsService.upsertDailyMetric({
        campaignId: campaigns[0].id,
        date: '2020-04-02',
        impressions: 200,
        clicks: 20,
        spend: 30,
        conversions: 3,
        revenue: 90,
      });

      const count = await metricRepo.count({
        where: { campaignId: campaigns[0].id, date: '2020-04-02' },
      });

      expect(count).toBe(1);
      expect(Number(updated.spend)).toBe(30);
      expect(Number(updated.revenue)).toBe(90);
    });

    it('keeps campaign, ad account, metric, and insight data scoped by store', async () => {
      const campaignsResponse = await request(app.getHttpServer())
        .get(`/api/campaigns?page=1&limit=20&storeId=${stores[0].id}`)
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .expect(200);
      expect(campaignsResponse.body.data.map((campaign: Campaign) => campaign.id)).toEqual([
        campaigns[0].id,
      ]);

      await request(app.getHttpServer())
        .get(`/api/campaigns/${campaigns[1].id}`)
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/api/campaigns/${campaigns[1].id}`)
        .set('Authorization', `Bearer ${tokens[Role.OPERATIONAL]}`)
        .expect(404);

      const adAccountsResponse = await request(app.getHttpServer())
        .get(`/api/ad-accounts?storeId=${stores[0].id}`)
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .expect(200);
      expect(adAccountsResponse.body.map((account: AdAccount) => account.id)).toEqual(
        expect.arrayContaining([adAccounts[0].id, adAccounts[2].id]),
      );
      expect(adAccountsResponse.body).toHaveLength(2);
      expect(adAccountsResponse.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: adAccounts[2].id, active: false }),
        ]),
      );
      for (const account of adAccountsResponse.body) {
        expect(account).not.toHaveProperty('accessToken');
      }

      await request(app.getHttpServer())
        .get(`/api/ad-accounts/${adAccounts[1].id}`)
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/api/ad-accounts/${adAccounts[1].id}`)
        .set('Authorization', `Bearer ${tokens[Role.OPERATIONAL]}`)
        .expect(404);

      const metricsSummary = await request(app.getHttpServer())
        .get(`/api/metrics/summary?${range}&storeId=${stores[0].id}`)
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .expect(200);
      expect(metricsSummary.body.spend).toBe(10);
      expect(metricsSummary.body.revenue).toBe(50);

      await request(app.getHttpServer())
        .get(`/api/metrics/campaigns/${campaigns[1].id}?${range}`)
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/api/metrics/campaigns/${campaigns[1].id}/aggregate?${range}`)
        .set('Authorization', `Bearer ${tokens[Role.OPERATIONAL]}`)
        .expect(404);

      const insightsResponse = await request(app.getHttpServer())
        .get(`/api/insights?storeId=${stores[0].id}`)
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .expect(200);
      expect(insightsResponse.body.map((insight: Insight) => insight.id)).toEqual([insightA.id]);

      await request(app.getHttpServer())
        .get(`/api/insights/${insightB.id}`)
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .expect(404);

      await request(app.getHttpServer())
        .patch(`/api/insights/${insightA.id}/resolve`)
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/campaigns/${campaigns[1].id}`)
        .set('Authorization', `Bearer ${tokens[Role.PLATFORM_ADMIN]}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/ad-accounts/${adAccounts[1].id}`)
        .set('Authorization', `Bearer ${tokens[Role.PLATFORM_ADMIN]}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/insights/${insightB.id}`)
        .set('Authorization', `Bearer ${tokens[Role.PLATFORM_ADMIN]}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/metrics/campaigns/${campaigns[1].id}?${range}`)
        .set('Authorization', `Bearer ${tokens[Role.PLATFORM_ADMIN]}`)
        .expect(200);
    });

    it('serves dashboard summaries for manager, operational, and client scopes', async () => {
      for (const role of [Role.MANAGER, Role.OPERATIONAL, Role.CLIENT]) {
        const response = await request(app.getHttpServer())
          .get(`/api/dashboard/summary?days=90&storeId=${stores[0].id}`)
          .set('Authorization', `Bearer ${tokens[role]}`)
          .expect(200);

        expect(response.body.scope.storeId).toBe(stores[0].id);
        expect(response.body.metrics.spend).toBe(10);
      }
    });
  });

  describe('store Meta integrations', () => {
    it('allows linked operational and platform admin to start Meta OAuth by store', async () => {
      const initial = await request(app.getHttpServer())
        .get(`/api/integrations/meta/stores/${stores[0].id}/status`)
        .set('Authorization', `Bearer ${tokens[Role.OPERATIONAL]}`)
        .expect(200);
      expect(initial.body.status).toBe(IntegrationStatus.NOT_CONNECTED);
      expect(initial.body).not.toHaveProperty('accessToken');
      expect(initial.body).not.toHaveProperty('refreshToken');
      expect(initial.body).not.toHaveProperty('metadata');

      const started = await request(app.getHttpServer())
        .get(`/api/integrations/meta/stores/${stores[0].id}/oauth/start`)
        .set('Authorization', `Bearer ${tokens[Role.OPERATIONAL]}`)
        .expect(200);
      expect(started.body.authorizationUrl).toContain('https://www.facebook.com/');
      expect(started.body.authorizationUrl).toContain('client_id=123456789012345');
      expect(started.body.authorizationUrl).toContain('response_type=code');
      expect(started.body.authorizationUrl).toContain('state=');

      const adminStarted = await request(app.getHttpServer())
        .get(`/api/integrations/meta/stores/${stores[1].id}/oauth/start`)
        .set('Authorization', `Bearer ${tokens[Role.ADMIN]}`)
        .expect(200);
      expect(adminStarted.body.authorizationUrl).toContain('https://www.facebook.com/');
      expect(adminStarted.body.authorizationUrl).toContain('state=');

      await request(app.getHttpServer())
        .patch(`/api/integrations/meta/stores/${stores[0].id}/status`)
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .send({ status: IntegrationStatus.EXPIRED, lastSyncStatus: 'ERROR', lastSyncError: 'expired token' })
        .expect(403);

      const disconnected = await request(app.getHttpServer())
        .delete(`/api/integrations/meta/stores/${stores[0].id}`)
        .set('Authorization', `Bearer ${tokens[Role.ADMIN]}`)
        .expect(200);
      expect(disconnected.body.status).toBe(IntegrationStatus.NOT_CONNECTED);
    });

    it('blocks unlinked operational, manager, and client integration execution', async () => {
      const unlinkedOperationalToken = await login(users.OPERATIONAL_UNLINKED!.email);

      await request(app.getHttpServer())
        .get(`/api/integrations/meta/stores/${stores[1].id}/oauth/start`)
        .set('Authorization', `Bearer ${tokens[Role.OPERATIONAL]}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/integrations/meta/stores/${stores[0].id}/oauth/start`)
        .set('Authorization', `Bearer ${unlinkedOperationalToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/integrations/meta/stores/${stores[0].id}/oauth/start`)
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/integrations/meta/stores/${stores[0].id}/oauth/start`)
        .set('Authorization', `Bearer ${tokens[Role.CLIENT]}`)
        .expect(403);

      await request(app.getHttpServer())
        .post(`/api/integrations/meta/stores/${stores[0].id}/connect`)
        .set('Authorization', `Bearer ${tokens[Role.MANAGER]}`)
        .send({ accessToken: 'manual-token' })
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/integrations/meta/stores/${stores[0].id}/status`)
        .set('Authorization', `Bearer ${tokens[Role.CLIENT]}`)
        .expect(403);
    });
  });

  describe('database integrity', () => {
    it('rejects invalid foreign keys when the database enforces them', async () => {
      await expect(
        adAccountRepo.save(
          adAccountRepo.create({
            metaId: `${runId}_invalid_fk`,
            name: 'Invalid FK',
            userId: users[Role.MANAGER]!.id,
            storeId: '00000000-0000-0000-0000-000000000000',
            active: true,
          }),
        ),
      ).rejects.toBeTruthy();
    });
  });
});
