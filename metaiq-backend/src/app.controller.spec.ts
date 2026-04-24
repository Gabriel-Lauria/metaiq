import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller';

describe('AppController health/readiness', () => {
  it('returns minimal health status without touching the database', () => {
    const dataSource = { isInitialized: false, query: jest.fn() } as unknown as DataSource;
    const controller = new AppController(dataSource);

    expect(controller.health()).toEqual({
      status: 'ok',
    });
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('returns ready when database query succeeds', async () => {
    const dataSource = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{ ok: 1 }]),
    } as unknown as DataSource;
    const controller = new AppController(dataSource);

    await expect(controller.ready()).resolves.toEqual({
      status: 'ready',
    });
    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns live without database dependency', () => {
    const dataSource = { isInitialized: false, query: jest.fn() } as unknown as DataSource;
    const controller = new AppController(dataSource);

    expect(controller.live()).toEqual({ status: 'alive' });
  });

  it('fails readiness when the database is unavailable', async () => {
    const dataSource = {
      isInitialized: true,
      query: jest.fn().mockRejectedValue(new Error('database unavailable')),
    } as unknown as DataSource;
    const controller = new AppController(dataSource);

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
