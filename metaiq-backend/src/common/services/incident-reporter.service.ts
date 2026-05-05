import { Injectable, Logger } from '@nestjs/common';

export interface IncidentReportPayload {
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  summary: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class IncidentReporterService {
  private readonly logger = new Logger(IncidentReporterService.name);

  async report(payload: IncidentReportPayload): Promise<void> {
    this.logger.warn(JSON.stringify({
      event: 'INCIDENT_REPORTED',
      ...payload,
    }));
  }
}
