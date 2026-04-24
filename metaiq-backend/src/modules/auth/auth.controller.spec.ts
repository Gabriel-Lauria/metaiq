import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';

describe('AuthController', () => {
  let app: INestApplication;

  const authService = {
    login: jest.fn(),
    register: jest.fn(),
    refreshTokens: jest.fn(),
    logoutByRefreshToken: jest.fn(),
    logoutByAccessToken: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'app.nodeEnv') return 'test';
              if (key === 'jwt.refreshExpiresIn') return '7d';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('sets the refresh cookie on login', async () => {
    authService.login.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'user-1', role: 'ADMIN' },
    });

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'secret123' })
      .expect(200);

    const loginCookies = Array.isArray(response.headers['set-cookie'])
      ? response.headers['set-cookie'].join(';')
      : response.headers['set-cookie'] ?? '';
    expect(loginCookies).toContain('metaiq_refresh_token=refresh-token');
    expect(authService.login).toHaveBeenCalledWith('user@test.com', 'secret123');
  });

  it('sets the refresh cookie on register', async () => {
    authService.register.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'user-1', role: 'ADMIN' },
    });

    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Beta User',
        email: 'beta@test.com',
        password: 'secret123',
        businessName: 'Empresa Beta',
        defaultState: 'PR',
        defaultCity: 'Curitiba',
      })
      .expect(201);

    const registerCookies = Array.isArray(response.headers['set-cookie'])
      ? response.headers['set-cookie'].join(';')
      : response.headers['set-cookie'] ?? '';
    expect(registerCookies).toContain('metaiq_refresh_token=refresh-token');
    expect(authService.register).toHaveBeenCalled();
  });

  it('returns 401 when refresh is called without a cookie', async () => {
    authService.refreshTokens.mockRejectedValue(
      new UnauthorizedException('Refresh token não enviado'),
    );

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({})
      .expect(401);

    expect(authService.refreshTokens).toHaveBeenCalledWith('');
  });
});
