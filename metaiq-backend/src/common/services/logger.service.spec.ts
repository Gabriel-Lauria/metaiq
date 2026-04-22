import { LoggerService } from './logger.service';

describe('LoggerService', () => {
  it('emits structured logs and masks sensitive metadata', () => {
    const service = new LoggerService();
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
    }));
    expect(payload.metadata.userId).toBe('user-1');
    expect(payload.metadata.accessToken).toBe('[REDACTED]');
    expect(payload.metadata.nested.password).toBe('[REDACTED]');
    expect(payload.metadata.nested.safe).toBe('visible');
  });
});
