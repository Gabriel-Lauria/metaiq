import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller';

describe('AppController health/readiness', () => {
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'app.nodeEnv': 'test',
        'database.type': 'postgres',
      };
      return values[key];
    }),
  } as unknown as ConfigService;

  it('returns health metadata without touching the database', () => {
    const dataSource = { isInitialized: false, query: jest.fn() } as unknown as DataSource;
    const controller = new AppController(dataSource, configService);

    expect(controller.health()).toEqual(expect.objectContaining({
      status: 'ok',
      service: 'metaiq-backend',
      environment: 'test',
      db: 'postgres',
    }));
  });

  it('returns ready when database query succeeds', async () => {
    const dataSource = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{ ok: 1 }]),
    } as unknown as DataSource;
    const controller = new AppController(dataSource, configService);

    await expect(controller.ready()).resolves.toEqual(expect.objectContaining({
      status: 'ready',
      db: 'postgres',
    }));
    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('fails readiness when the database is unavailable', async () => {
    const dataSource = {
      isInitialized: true,
      query: jest.fn().mockRejectedValue(new Error('database unavailable')),
    } as unknown as DataSource;
    const controller = new AppController(dataSource, configService);

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
