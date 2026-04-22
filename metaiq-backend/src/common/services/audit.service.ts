import { Injectable } from '@nestjs/common';
import { Role } from '../enums';
import { LoggerService } from './logger.service';

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
  constructor(private readonly logger: LoggerService) {}

  record(event: AuditEvent): void {
    this.logger.info('AUDIT_EVENT', {
      eventType: 'audit',
      ...event,
      metadata: event.metadata ?? {},
    });
  }
}
