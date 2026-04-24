import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../enums';
import { AuditLog } from '../entities/audit-log.entity';
import { LoggerService } from './logger.service';
import { RequestContextService } from './request-context.service';

export type AuditStatus = 'success' | 'failure';

export interface AuditEvent {
  action: string;
  status: AuditStatus;
  actorId?: string | null;
  actorRole?: Role | string | null;
  tenantId?: string | null;
  targetType?: string;
  targetId?: string | null;
  reason?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly logger: LoggerService,
    private readonly requestContext: RequestContextService,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  record(event: AuditEvent): void {
    const context = this.requestContext.get();
    const normalizedEvent = {
      ...event,
      actorId: event.actorId ?? context.userId ?? null,
      actorRole: event.actorRole ?? context.userRole ?? null,
      tenantId: event.tenantId ?? context.tenantId ?? null,
      requestId: event.requestId ?? context.requestId,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      reason: event.reason ?? null,
      metadata: event.metadata ?? {},
    };

    this.logger.info('AUDIT_EVENT', {
      eventType: 'audit',
      ...normalizedEvent,
    });

    void this.auditLogRepository.save(
      this.auditLogRepository.create(normalizedEvent),
    ).catch((error) => {
      this.logger.error('AUDIT_PERSIST_FAILED', error, {
        module: 'audit',
        action: event.action,
        requestId: normalizedEvent.requestId,
      });
    });
  }
}
