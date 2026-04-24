import { LoggerService } from './logger.service';

describe('LoggerService', () => {
  it('emits structured logs and masks sensitive metadata', () => {
    const requestContext = { get: jest.fn(() => ({ requestId: 'req-1' })) } as any;
    const service = new LoggerService(requestContext);
    const logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);

    service.info('test log', {
      userId: 'user-1',
      accessToken: 'secret-token',
      nested: {
        password: 'secret-password',
        safe: 'visible',
      },
    });

    const payload = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(payload).toEqual(expect.objectContaining({
      level: 'INFO',
      message: 'test log',
      requestId: 'req-1',
    }));
    expect(payload.metadata.userId).toBe('user-1');
    expect(payload.metadata.accessToken).toBe('[REDACTED]');
    expect(payload.metadata.nested.password).toBe('[REDACTED]');
    expect(payload.metadata.nested.safe).toBe('visible');
  });

  it('promotes operational identifiers to top-level fields', () => {
    const requestContext = { get: jest.fn(() => ({})) } as any;
    const service = new LoggerService(requestContext);
    const logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);

    service.info('meta event', {
      module: 'meta',
      requestId: 'req-meta',
      userId: 'user-1',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      executionId: 'execution-1',
      idempotencyKey: 'idem-1',
    });

    const payload = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(payload).toMatchObject({
      module: 'meta',
      requestId: 'req-meta',
      userId: 'user-1',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      executionId: 'execution-1',
      idempotencyKey: 'idem-1',
    });
  });
});
