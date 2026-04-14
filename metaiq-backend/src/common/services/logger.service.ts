import { Injectable, Logger } from '@nestjs/common';

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

  /**
   * Log de informação
   */
  info(message: string, metadata?: Record<string, any>) {
    const log = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message,
      ...(metadata && { metadata }),
    };
    this.logger.log(JSON.stringify(log));
  }

  /**
   * Log de aviso
   */
  warn(message: string, metadata?: Record<string, any>) {
    const log = {
      timestamp: new Date().toISOString(),
      level: 'WARN',
      message,
      ...(metadata && { metadata }),
    };
    this.logger.warn(JSON.stringify(log));
  }

  /**
   * Log de erro
   */
  error(message: string, error?: Error | any, metadata?: Record<string, any>) {
    const log = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
      ...(metadata && { metadata }),
    };
    this.logger.error(JSON.stringify(log));
  }

  /**
   * Log de debug (desabilitado em produção)
   */
  debug(message: string, metadata?: Record<string, any>) {
    if (process.env.NODE_ENV !== 'production') {
      const log = {
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        message,
        ...(metadata && { metadata }),
      };
      this.logger.debug(JSON.stringify(log));
    }
  }

  /**
   * Log de métrica de performance
   */
  metric(operation: string, durationMs: number, metadata?: Record<string, any>) {
    const log = {
      timestamp: new Date().toISOString(),
      level: 'METRIC',
      operation,
      durationMs,
      ...(metadata && { metadata }),
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
}
