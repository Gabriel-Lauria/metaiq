import { AuditService } from './audit.service';
import { LoggerService } from './logger.service';

describe('AuditService', () => {
  it('records audit events through structured logger', () => {
    const logger = { info: jest.fn() } as unknown as LoggerService;
    const requestContext = { get: jest.fn(() => ({ requestId: 'req-1' })) } as any;
    const repository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    } as any;
    const service = new AuditService(logger, requestContext, repository);

    service.record({
      action: 'auth.login',
      status: 'success',
      actorId: 'user-1',
      tenantId: 'tenant-1',
      metadata: { email: 'admin@test.com' },
    });

    expect(logger.info).toHaveBeenCalledWith('AUDIT_EVENT', expect.objectContaining({
      eventType: 'audit',
      action: 'auth.login',
      status: 'success',
      actorId: 'user-1',
      tenantId: 'tenant-1',
      requestId: 'req-1',
      metadata: { email: 'admin@test.com' },
    }));
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      action: 'auth.login',
      status: 'success',
      actorId: 'user-1',
      tenantId: 'tenant-1',
      requestId: 'req-1',
    }));
  });
});
