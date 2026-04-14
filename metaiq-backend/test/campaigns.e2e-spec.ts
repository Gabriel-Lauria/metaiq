import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import * as bcryptjs from 'bcryptjs';

describe('Campaigns E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let user1Token: string;
  let user2Token: string;
  let campaign1Id: string;
  let campaign2Id: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
  });

  afterAll(async () => {
    await app.close();
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  describe('Auth — Prerequisites', () => {
    it('should register user 1', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'user1@test.com',
          password: 'Test@1234',
          name: 'User One',
        })
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      user1Token = response.body.accessToken;
    });

    it('should register user 2', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'user2@test.com',
          password: 'Test@5678',
          name: 'User Two',
        })
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      user2Token = response.body.accessToken;
    });

    it('should login with user 1', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user1@test.com',
          password: 'Test@1234',
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      user1Token = response.body.accessToken;
    });

    it('should reject invalid token', async () => {
      await request(app.getHttpServer())
        .get('/campaigns')
        .set('Authorization', 'Bearer invalid_token_xyz')
        .expect(401);
    });

    it('should reject missing token', async () => {
      await request(app.getHttpServer())
        .get('/campaigns')
        .expect(401);
    });
  });

  describe('GET /campaigns — Ownership Isolation', () => {
    beforeAll(async () => {
      // Create campaign for user 1
      const camp1Response = await request(app.getHttpServer())
        .post('/campaigns')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'User 1 Campaign',
          metaId: 'meta_user1_camp1',
          objective: 'CONVERSIONS',
          dailyBudget: 100,
          startTime: new Date('2026-01-01'),
        })
        .expect(201);

      campaign1Id = camp1Response.body.id;

      // Create campaign for user 2
      const camp2Response = await request(app.getHttpServer())
        .post('/campaigns')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          name: 'User 2 Campaign',
          metaId: 'meta_user2_camp1',
          objective: 'REACH',
          dailyBudget: 200,
          startTime: new Date('2026-01-01'),
        })
        .expect(201);

      campaign2Id = camp2Response.body.id;
    });

    it('should list only user 1 campaigns', async () => {
      const response = await request(app.getHttpServer())
        .get('/campaigns?page=1&limit=10')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(Array.isArray(response.body.data)).toBe(true);
      
      // Verify all campaigns belong to user 1
      response.body.data.forEach((campaign: any) => {
        expect(campaign.name).not.toContain('User 2');
      });
    });

    it('should list only user 2 campaigns', async () => {
      const response = await request(app.getHttpServer())
        .get('/campaigns?page=1&limit=10')
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data.length).toBeGreaterThan(0);
      
      // Verify all campaigns belong to user 2
      response.body.data.forEach((campaign: any) => {
        expect(campaign.name).not.toContain('User 1');
      });
    });

    it('user 1 should NOT access user 2 campaign by ID', async () => {
      await request(app.getHttpServer())
        .get(`/campaigns/${campaign2Id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(404);
    });

    it('user 1 should access own campaign by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/campaigns/${campaign1Id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body.id).toBe(campaign1Id);
      expect(response.body.name).toContain('User 1');
    });

    it('user 2 should access own campaign by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/campaigns/${campaign2Id}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(200);

      expect(response.body.id).toBe(campaign2Id);
      expect(response.body.name).toContain('User 2');
    });
  });

  describe('Pagination', () => {
    it('should paginate campaigns correctly', async () => {
      const response1 = await request(app.getHttpServer())
        .get('/campaigns?page=1&limit=1')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(response1.body.meta).toHaveProperty('page', 1);
      expect(response1.body.meta).toHaveProperty('limit', 1);
      expect(response1.body.meta).toHaveProperty('total');
      expect(response1.body.meta).toHaveProperty('totalPages');
      expect(response1.body.data).toHaveLength(1);
    });

    it('should validate pagination parameters', async () => {
      await request(app.getHttpServer())
        .get('/campaigns?page=-1&limit=0')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(400);
    });
  });

  describe('Security Headers', () => {
    it('should require valid JWT token', async () => {
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      await request(app.getHttpServer())
        .get('/campaigns')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    it('should reject malformed Authorization header', async () => {
      await request(app.getHttpServer())
        .get('/campaigns')
        .set('Authorization', 'NotValid token_here')
        .expect(401);
    });
  });
});
