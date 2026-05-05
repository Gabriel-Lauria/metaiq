import { Injectable, Logger } from '@nestjs/common';
import { RequestContextService } from './request-context.service';

/**
 * LoggerService fornece logging estruturado e consistente em toda a aplicação.
 * 
 * Uso:
 *   constructor(private loggerService: LoggerService) {}
 *   
 *   this.loggerService.info('Operação realizada', { userId: '123', action: 'create' });
 *   this.loggerService.error('Erro crítico', new Error('...'), { context: 'campaign' });
 */
@Injectable()
export class LoggerService {
  private readonly logger = new Logger('MetaIQ');
  private readonly sensitiveKeys = [
    'password',
    'token',
    'accessToken',
    'refreshToken',
    'authorization',
    'cookie',
    'set-cookie',
    'secret',
    'clientSecret',
    'appSecret',
    'apiKey',
    'metaAccessToken',
    'databaseUrl',
    'dbUrl',
    'connectionString',
  ];

  constructor(private readonly requestContext: RequestContextService) {}

  info(message: string, metadata?: Record<string, any>) {
    const log = this.buildEntry('INFO', message, metadata);
    this.logger.log(JSON.stringify(log));
  }

  warn(message: string, metadata?: Record<string, any>) {
    const log = this.buildEntry('WARN', message, metadata);
    this.logger.warn(JSON.stringify(log));
  }

  error(message: string, error?: Error | any, metadata?: Record<string, any>) {
    const log = {
      ...this.buildEntry('ERROR', message, metadata),
      error: error ? {
        name: error.name,
        message: error.message,
        ...(process.env.NODE_ENV === 'production' ? {} : { stack: error.stack }),
      } : undefined,
    };
    this.logger.error(JSON.stringify(log));
  }

  /**
   * Log de debug (desabilitado em produção)
   */
  debug(message: string, metadata?: Record<string, any>) {
    if (process.env.NODE_ENV !== 'production') {
      const log = this.buildEntry('DEBUG', message, metadata);
      this.logger.debug(JSON.stringify(log));
    }
  }

  /**
   * Log de métrica de performance
   */
  metric(operation: string, durationMs: number, metadata?: Record<string, any>) {
    const log = {
      ...this.buildEntry('METRIC', 'METRIC_EVENT', metadata),
      operation,
      durationMs,
    };
    this.logger.log(JSON.stringify(log));
  }

  /**
   * Log de início de operação (retorna função para log de conclusão)
   */
  startOperation(operation: string, metadata?: Record<string, any>) {
    const startTime = Date.now();
    
    this.info(`Operação iniciada: ${operation}`, metadata);

    return {
      end: (success: boolean, endMetadata?: Record<string, any>) => {
        const duration = Date.now() - startTime;
        const status = success ? 'sucesso' : 'falha';
        
        this.info(`Operação finalizada: ${operation} [${status}]`, {
          duration,
          ...endMetadata,
        });

        this.metric(operation, duration, { success, ...endMetadata });
      },
    };
  }

  private buildEntry(level: string, message: string, metadata?: Record<string, any>) {
    const currentContext = this.requestContext?.get?.() ?? {};
    const sanitizedMetadata = metadata ? this.sanitize(metadata) as Record<string, unknown> : undefined;
    const context = {
      requestId: sanitizedMetadata?.requestId ?? currentContext.requestId,
      userId: sanitizedMetadata?.userId ?? currentContext.userId,
      tenantId: sanitizedMetadata?.tenantId ?? currentContext.tenantId,
      userRole: sanitizedMetadata?.userRole ?? currentContext.userRole,
      method: sanitizedMetadata?.method ?? currentContext.method,
      path: sanitizedMetadata?.path ?? currentContext.path,
      module: sanitizedMetadata?.module ?? sanitizedMetadata?.context,
      storeId: sanitizedMetadata?.storeId,
      campaignId: sanitizedMetadata?.campaignId,
      executionId: sanitizedMetadata?.executionId,
      idempotencyKey: sanitizedMetadata?.idempotencyKey,
    };

    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.compact(context),
      ...(sanitizedMetadata ? { metadata: sanitizedMetadata } : {}),
    };
  }

  private compact(value: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(value).filter(([, nestedValue]) => nestedValue !== undefined && nestedValue !== null),
    );
  }

  private sanitize(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item));
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        this.isSensitiveKey(key) ? '[REDACTED]' : this.sanitize(nestedValue),
      ]),
    );
  }

  private isSensitiveKey(key: string): boolean {
    const normalized = key.toLowerCase();
    return this.sensitiveKeys.some((sensitive) => normalized.includes(sensitive.toLowerCase()));
  }
}
