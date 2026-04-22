import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

describe('Application health E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DB_TYPE = 'sqlite';
    process.env.DATABASE_TYPE = 'sqlite';
    process.env.SQLITE_PATH = ':memory:';
    process.env.TYPEORM_SYNCHRONIZE = 'true';
    process.env.TYPEORM_MIGRATIONS_RUN = 'false';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
    process.env.CRYPTO_SECRET = process.env.CRYPTO_SECRET || 'test-crypto-secret';
    process.env.META_APP_ID = process.env.META_APP_ID || '123456789012345';
    process.env.META_APP_SECRET = process.env.META_APP_SECRET || 'test-meta-secret';
    process.env.META_REDIRECT_URI =
      process.env.META_REDIRECT_URI || 'http://localhost:3004/api/integrations/meta/oauth/callback';

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
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns health status without exposing secrets', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(response.body).toEqual(expect.objectContaining({
      status: 'ok',
      service: 'metaiq-backend',
      environment: 'test',
      db: 'sqlite',
    }));
    expect(JSON.stringify(response.body)).not.toContain('test-jwt-secret');
  });

  it('returns readiness when the database is reachable', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/ready')
      .expect(200);

    expect(response.body).toEqual(expect.objectContaining({
      status: 'ready',
      db: 'sqlite',
    }));
  });
});
