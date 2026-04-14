import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { User } from '../src/modules/users/user.entity';
import { Campaign } from '../src/modules/campaigns/campaign.entity';
import { MetricDaily } from '../src/modules/metrics/metric-daily.entity';
import { Insight } from '../src/modules/insights/insight.entity';

describe('Multi-tenant security E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userRepo: Repository<User>;
  let campaignRepo: Repository<Campaign>;
  let metricRepo: Repository<MetricDaily>;
  let insightRepo: Repository<Insight>;

  let user1: User;
  let user2: User;
  let user1Token: string;
  let user2Token: string;
  let user1AdAccountId: string;
  let user2AdAccountId: string;
  let user1CampaignId: string;
  let user2CampaignId: string;
  let user1InsightId: string;
  let user2InsightId: string;

  const range = 'from=2026-01-01&to=2026-12-31';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SQLITE_PATH = ':memory:';
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.CRYPTO_SECRET = 'test-crypto-secret';

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
    campaignRepo = dataSource.getRepository(Campaign);
    metricRepo = dataSource.getRepository(MetricDaily);
    insightRepo = dataSource.getRepository(Insight);
  });

  afterAll(async () => {
    await app.close();
  });

  async function register(email: string, password: string, name: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, name })
      .expect(201);

    const user = await userRepo.findOneByOrFail({ id: response.body.user.id });
    return { user, token: response.body.accessToken };
  }

  async function createAdAccount(token: string, suffix: string) {
    const response = await request(app.getHttpServer())
      .post('/api/ad-accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        metaId: `act_${suffix}`,
        name: `Ad Account ${suffix}`,
        currency: 'BRL',
        accessToken: `sensitive-token-${suffix}`,
      })
      .expect(201);

    expect(response.body).not.toHaveProperty('accessToken');
    return response.body.id as string;
  }

  async function seedCampaignGraph() {
    const user1Campaign = campaignRepo.create({
      metaId: 'meta_user1_campaign',
      name: 'User 1 Campaign',
      status: 'ACTIVE',
      objective: 'CONVERSIONS',
      dailyBudget: 100,
      score: 80,
      startTime: new Date('2026-01-01'),
      userId: user1.id,
      adAccountId: user1AdAccountId,
    });

    const user2Campaign = campaignRepo.create({
      metaId: 'meta_user2_campaign',
      name: 'User 2 Campaign',
      status: 'ACTIVE',
      objective: 'REACH',
      dailyBudget: 200,
      score: 40,
      startTime: new Date('2026-01-01'),
      userId: user2.id,
      adAccountId: user2AdAccountId,
    });

    const savedCampaigns = await campaignRepo.save([user1Campaign, user2Campaign]);
    user1CampaignId = savedCampaigns[0].id;
    user2CampaignId = savedCampaigns[1].id;

    await metricRepo.save([
      metricRepo.create({
        campaignId: user1CampaignId,
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
        campaignId: user2CampaignId,
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

    const insights = await insightRepo.save([
      insightRepo.create({
        campaignId: user1CampaignId,
        type: 'opportunity',
        severity: 'success',
        message: 'User 1 insight',
        recommendation: 'Scale user 1 campaign',
        resolved: false,
        priority: 'low',
        cooldownInHours: 24,
        ruleVersion: 1,
      }),
      insightRepo.create({
        campaignId: user2CampaignId,
        type: 'alert',
        severity: 'danger',
        message: 'User 2 insight',
        recommendation: 'Fix user 2 campaign',
        resolved: false,
        priority: 'high',
        cooldownInHours: 4,
        ruleVersion: 1,
      }),
    ]);

    user1InsightId = insights[0].id;
    user2InsightId = insights[1].id;
  }

  describe('setup and authentication', () => {
    it('registers isolated users and creates scoped ad accounts', async () => {
      const first = await register('user1.e2e@test.com', 'Test@1234', 'User One');
      const second = await register('user2.e2e@test.com', 'Test@5678', 'User Two');

      user1 = first.user;
      user2 = second.user;
      user1Token = first.token;
      user2Token = second.token;

      user1AdAccountId = await createAdAccount(user1Token, 'user1');
      user2AdAccountId = await createAdAccount(user2Token, 'user2');
      await seedCampaignGraph();
    });

    it('rejects missing and malformed JWTs', async () => {
      await request(app.getHttpServer()).get('/api/campaigns').expect(401);

      await request(app.getHttpServer())
        .get('/api/campaigns')
        .set('Authorization', 'Bearer invalid_token_xyz')
        .expect(401);
    });

    it('exposes the authenticated user id through CurrentUser', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/protected')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body.user).toBe(user1.id);
    });
  });

  describe('ad accounts ownership', () => {
    it('lists only the authenticated user ad accounts and never returns tokens', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/ad-accounts')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(user1AdAccountId);
      expect(response.body[0].userId).toBe(user1.id);
      expect(response.body[0]).not.toHaveProperty('accessToken');
    });

    it('blocks cross-tenant read, update, and delete by ad account id', async () => {
      await request(app.getHttpServer())
        .get(`/api/ad-accounts/${user2AdAccountId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(404);

      await request(app.getHttpServer())
        .patch(`/api/ad-accounts/${user2AdAccountId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ name: 'Hijacked' })
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/ad-accounts/${user2AdAccountId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(404);
    });
  });

  describe('campaign ownership', () => {
    it('lists only the authenticated user campaigns', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/campaigns?page=1&limit=10')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body.data.map((campaign: Campaign) => campaign.id)).toEqual([
        user1CampaignId,
      ]);
      expect(response.body.data[0].userId).toBe(user1.id);
    });

    it('blocks cross-tenant campaign read by id', async () => {
      await request(app.getHttpServer())
        .get(`/api/campaigns/${user2CampaignId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(404);
    });
  });

  describe('metrics ownership', () => {
    it('summarizes only the authenticated user metrics', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/metrics/summary?${range}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body.spend).toBe(10);
      expect(response.body.revenue).toBe(50);
      expect(response.body.impressions).toBe(1000);
    });

    it('does not return another tenant metrics through campaign filters', async () => {
      const paginated = await request(app.getHttpServer())
        .get(`/api/metrics?campaignId=${user2CampaignId}&page=1&limit=10`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(paginated.body.data).toEqual([]);
      expect(paginated.body.meta.total).toBe(0);

      const byCampaign = await request(app.getHttpServer())
        .get(`/api/metrics/campaigns/${user2CampaignId}?${range}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(byCampaign.body).toEqual([]);
    });
  });

  describe('insights ownership', () => {
    it('lists only the authenticated user insights', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/insights')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(user1InsightId);
      expect(response.body[0].message).toBe('User 1 insight');
    });

    it('blocks cross-tenant insight read and resolution', async () => {
      await request(app.getHttpServer())
        .get(`/api/insights/${user2InsightId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(404);

      await request(app.getHttpServer())
        .patch(`/api/insights/${user2InsightId}/resolve`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(404);
    });

    it('allows resolving an owned insight', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/insights/${user1InsightId}/resolve`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body.id).toBe(user1InsightId);
      expect(response.body.resolved).toBe(true);
    });
  });

  describe('meta integration endpoints', () => {
    it('requires authentication for operational meta endpoints', async () => {
      await request(app.getHttpServer()).get('/api/meta/status').expect(401);
      await request(app.getHttpServer()).post('/api/meta/sync').expect(401);
    });

    it('allows authenticated access to meta status without leaking secrets', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/meta/status')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body.provider).toBe('Meta');
      expect(response.body).not.toHaveProperty('token');
      expect(response.body).not.toHaveProperty('accessToken');
    });
  });
});
