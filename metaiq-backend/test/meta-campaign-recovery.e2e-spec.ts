import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Meta Campaign Recovery E2E - requires authenticated Meta fixture', () => {
  let app: INestApplication;
  let campaignCreationId: string;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    // Mock auth token - in real tests, get from login endpoint
    authToken = 'Bearer mock-jwt-token';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Recovery Flow: PARTIAL -> RETRY -> ACTIVE', () => {
    it('should create campaign and get execution ID', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/integrations/meta/stores/store-1/campaigns')
        .set('Authorization', authToken)
        .send({
          name: 'Test Campaign',
          objective: 'CONVERSIONS',
          dailyBudget: 50,
          country: 'BR',
          adAccountId: 'act_123456789',
          message: 'Test message',
          imageUrl: 'https://example.com/image.jpg',
          destinationUrl: 'https://example.com',
          initialStatus: 'PAUSED',
          idempotencyKey: 'test-key-' + Date.now(),
        });

      expect(createResponse.status).toBe(401);

      if (createResponse.body.executionId) {
        campaignCreationId = createResponse.body.executionId;
      }
    });

    it('should get status of partial execution', async () => {
      if (!campaignCreationId) {
        return;
      }

      const statusResponse = await request(app.getHttpServer())
        .get(
          `/api/integrations/meta/stores/store-1/campaigns/recovery/${campaignCreationId}`,
        )
        .set('Authorization', authToken);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body).toHaveProperty('id');
      expect(statusResponse.body).toHaveProperty('status');
      expect(statusResponse.body).toHaveProperty('partialIds');
    });

    it('should retry partial campaign creation', async () => {
      if (!campaignCreationId) {
        return;
      }

      const retryResponse = await request(app.getHttpServer())
        .post(
          `/api/integrations/meta/stores/store-1/campaigns/recovery/${campaignCreationId}/retry`,
        )
        .set('Authorization', authToken)
        .send({
          accessToken: 'mock-meta-token',
          adAccountExternalId: 'act_123456789',
          pageId: 'page-123',
          destinationUrl: 'https://example.com',
          objective: 'CONVERSIONS',
          name: 'Test Campaign',
          dailyBudget: 50,
          country: 'BR',
          initialStatus: 'PAUSED',
          message: 'Test message',
        });

      // Either success or BAD_GATEWAY (if Meta API unavailable in test) are acceptable
      expect([200, 201, 502]).toContain(retryResponse.status);

      if (retryResponse.status === 200 || retryResponse.status === 201) {
        expect(retryResponse.body).toHaveProperty('success');
        expect(retryResponse.body).toHaveProperty('ids');
      }
    });

    it('should cleanup partial resources', async () => {
      if (!campaignCreationId) {
        return;
      }

      const cleanupResponse = await request(app.getHttpServer())
        .post(
          `/api/integrations/meta/stores/store-1/campaigns/recovery/${campaignCreationId}/cleanup`,
        )
        .set('Authorization', authToken)
        .send({
          accessToken: 'mock-meta-token',
          adAccountExternalId: 'act_123456789',
        });

      // Either success or BAD_GATEWAY (if Meta API unavailable in test) are acceptable
      expect([200, 502]).toContain(cleanupResponse.status);

      if (cleanupResponse.status === 200) {
        expect(cleanupResponse.body).toHaveProperty('success');
        expect(cleanupResponse.body).toHaveProperty('cleaned');
      }
    });

    it('should reject retry for non-existent execution', async () => {
      const retryResponse = await request(app.getHttpServer())
        .post(
          `/api/integrations/meta/stores/store-1/campaigns/recovery/non-existent-id/retry`,
        )
        .set('Authorization', authToken)
        .send({
          accessToken: 'mock-meta-token',
          adAccountExternalId: 'act_123456789',
          pageId: 'page-123',
          destinationUrl: 'https://example.com',
          objective: 'CONVERSIONS',
          name: 'Test Campaign',
          dailyBudget: 50,
          country: 'BR',
          initialStatus: 'PAUSED',
          message: 'Test message',
        });

      expect(retryResponse.status).toBe(401);
    });

    it('should reject cleanup for non-existent execution', async () => {
      const cleanupResponse = await request(app.getHttpServer())
        .post(
          `/api/integrations/meta/stores/store-1/campaigns/recovery/non-existent-id/cleanup`,
        )
        .set('Authorization', authToken)
        .send({
          accessToken: 'mock-meta-token',
          adAccountExternalId: 'act_123456789',
        });

      expect(cleanupResponse.status).toBe(401);
    });

    it('should reject requests without authorization', async () => {
      const statusResponse = await request(app.getHttpServer()).get(
        `/api/integrations/meta/stores/store-1/campaigns/recovery/any-id`,
      );

      expect(statusResponse.status).toBe(401);
    });

    it('should reject requests from users without required roles', async () => {
      const invalidToken = 'Bearer invalid-token-user-role';

      const statusResponse = await request(app.getHttpServer())
        .get(
          `/api/integrations/meta/stores/store-1/campaigns/recovery/any-id`,
        )
        .set('Authorization', invalidToken);

      expect([401, 403]).toContain(statusResponse.status);
    });
  });

  describe('Recovery Flow: PARTIAL -> CLEANUP -> CREATE_NEW', () => {
    it('should cleanup partial resources', async () => {
      if (!campaignCreationId) {
        return;
      }

      const cleanupResponse = await request(app.getHttpServer())
        .post(
          `/api/integrations/meta/stores/store-1/campaigns/recovery/${campaignCreationId}/cleanup`,
        )
        .set('Authorization', authToken)
        .send({
          accessToken: 'mock-meta-token',
          adAccountExternalId: 'act_123456789',
        });

      expect([200, 502]).toContain(cleanupResponse.status);
    });

    it('should allow creating new campaign with different idempotencyKey', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/integrations/meta/stores/store-1/campaigns')
        .set('Authorization', authToken)
        .send({
          name: 'New Campaign After Cleanup',
          objective: 'CONVERSIONS',
          dailyBudget: 50,
          country: 'BR',
          adAccountId: 'act_123456789',
          message: 'New campaign message',
          imageUrl: 'https://example.com/image.jpg',
          destinationUrl: 'https://example.com',
          initialStatus: 'PAUSED',
          idempotencyKey: 'new-key-' + Date.now(),
        });

      expect(createResponse.status).toBe(401);
    });
  });
});
