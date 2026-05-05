import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller';

describe('AppController health/readiness', () => {
  function buildController(options?: {
    initialized?: boolean;
    queryImpl?: jest.Mock;
    cryptoSecret?: string;
    metaAppId?: string;
    metaAppSecret?: string;
    metaRedirectUri?: string;
  }) {
    const rawOneQueue = [
      { count: 2 },
      { lastSyncAt: new Date().toISOString() },
    ];
    const queryBuilder = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => rawOneQueue.shift()),
    };
    const dataSource = {
      isInitialized: options?.initialized ?? true,
      query: options?.queryImpl ?? jest.fn()
        .mockResolvedValueOnce([{ ok: 1 }]),
      createQueryBuilder: jest.fn(() => queryBuilder),
    } as unknown as DataSource;
    const config = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'app.cryptoSecret':
            return options?.cryptoSecret ?? 'real-crypto-secret';
          case 'meta.appId':
            return options?.metaAppId ?? '123456';
          case 'meta.appSecret':
            return options?.metaAppSecret ?? 'meta-secret';
          case 'meta.redirectUri':
            return options?.metaRedirectUri ?? 'https://metaiq.dev/oauth';
          default:
            return undefined;
        }
      }),
    } as unknown as ConfigService;

    return {
      controller: new AppController(dataSource, config),
      dataSource,
    };
  }

  it('retorna health degradado quando crypto obrigatoria nao esta configurada', async () => {
    const { controller } = buildController({ initialized: false, cryptoSecret: 'replace-with-a-secure-secret' });

    await expect(controller.health()).resolves.toEqual(expect.objectContaining({
      status: 'degraded',
      checks: expect.objectContaining({
        crypto: { status: 'not_ready' },
      }),
    }));
  });

  it('retorna ready ok quando banco, crypto, meta e sync estao saudaveis', async () => {
    const { controller, dataSource } = buildController();

    await expect(controller.ready()).resolves.toEqual(expect.objectContaining({
      status: 'ok',
      checks: expect.objectContaining({
        database: expect.objectContaining({ status: 'ok' }),
        crypto: { status: 'ok' },
        meta: { status: 'ok' },
        metricsSync: expect.objectContaining({ status: 'ok', metricRows: 2 }),
      }),
    }));
    expect((dataSource.query as jest.Mock).mock.calls[0][0]).toBe('SELECT 1');
  });

  it('retorna ready degradado quando Meta minima nao esta configurada', async () => {
    const { controller } = buildController({ metaAppSecret: '' });

    await expect(controller.ready()).resolves.toEqual(expect.objectContaining({
      status: 'degraded',
      checks: expect.objectContaining({
        meta: { status: 'degraded' },
      }),
    }));
  });

  it('falha readiness quando banco nao esta pronto', async () => {
    const { controller } = buildController({ initialized: false });

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
