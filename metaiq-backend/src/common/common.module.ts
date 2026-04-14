import { Module } from '@nestjs/common';
import { LoggerService } from './services/logger.service';
import { RetryService } from './services/retry.service';
import { MetricsService } from './services/metrics.service';

/**
 * CommonModule fornece serviços compartilhados usados por toda a aplicação.
 * 
 * Inclui:
 * - LoggerService: logging estruturado e consistente
 * - RetryService: retry com exponential backoff
 * - MetricsService: coleta de métricas de performance
 * - Guards: JWT, Ownership, etc
 * - Decorators: CurrentUser, Throttle, etc
 * - Utils: crypto, metrics, pagination
 */
@Module({
  providers: [LoggerService, RetryService, MetricsService],
  exports: [LoggerService, RetryService, MetricsService],
})
export class CommonModule {}
