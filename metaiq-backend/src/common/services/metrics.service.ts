import { Injectable } from '@nestjs/common';
import { LoggerService } from './logger.service';

/**
 * MetricsService coleta e relata métricas de operações do sistema.
 * 
 * Métricas monitoradas:
 * - Tempo de execução de operações
 * - Taxa de sucesso/falha
 * - Execução de cron jobs
 * - Uso de recursos
 * 
 * Uso:
 *   const metrics = this.metricsService.startTimer('campaign-creation');
 *   try {
 *     // ... lógica
 *     metrics.end();
 *   } catch (err) {
 *     metrics.end(false, { error: err.message });
 *   }
 */
@Injectable()
export class MetricsService {
  private metrics: Map<string, MetricData> = new Map();

  constructor(private readonly logger: LoggerService) {}

  /**
   * Inicia um timer para uma métrica
   */
  startTimer(operation: string) {
    const startTime = Date.now();

    return {
      end: (success: boolean = true, metadata?: Record<string, any>) => {
        const duration = Date.now() - startTime;
        this.recordMetric(operation, duration, success, metadata);
      },
    };
  }

  /**
   * Registra uma métrica
   */
  private recordMetric(
    operation: string,
    durationMs: number,
    success: boolean,
    metadata?: Record<string, any>,
  ) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, {
        count: 0,
        successCount: 0,
        errorCount: 0,
        totalDuration: 0,
        maxDuration: 0,
        minDuration: Infinity,
      });
    }

    const data = this.metrics.get(operation)!;
    data.count++;
    data.totalDuration += durationMs;
    data.maxDuration = Math.max(data.maxDuration, durationMs);
    data.minDuration = Math.min(data.minDuration, durationMs);

    if (success) {
      data.successCount++;
    } else {
      data.errorCount++;
    }

    // Log estruturado
    this.logger.metric(operation, durationMs, {
      success,
      ...metadata,
    });
  }

  /**
   * Obtém estatísticas de uma operação
   */
  getMetrics(operation: string): MetricStats | null {
    const data = this.metrics.get(operation);
    if (!data || data.count === 0) return null;

    return {
      operation,
      totalExecutions: data.count,
      successCount: data.successCount,
      errorCount: data.errorCount,
      successRate: ((data.successCount / data.count) * 100).toFixed(2) + '%',
      avgDuration: (data.totalDuration / data.count).toFixed(2) + 'ms',
      minDuration: data.minDuration + 'ms',
      maxDuration: data.maxDuration + 'ms',
    };
  }

  /**
   * Obtém todas as métricas
   */
  getAllMetrics(): MetricStats[] {
    return Array.from(this.metrics.entries())
      .filter(([, data]) => data.count > 0)
      .map(([operation, data]) => {
        return {
          operation,
          totalExecutions: data.count,
          successCount: data.successCount,
          errorCount: data.errorCount,
          successRate: ((data.successCount / data.count) * 100).toFixed(2) + '%',
          avgDuration: (data.totalDuration / data.count).toFixed(2) + 'ms',
          minDuration: data.minDuration === Infinity ? '0ms' : data.minDuration + 'ms',
          maxDuration: data.maxDuration + 'ms',
        };
      });
  }

  /**
   * Reseta as métricas
   */
  reset() {
    this.metrics.clear();
    this.logger.info('Métricas resetadas');
  }
}

interface MetricData {
  count: number;
  successCount: number;
  errorCount: number;
  totalDuration: number;
  maxDuration: number;
  minDuration: number;
}

export interface MetricStats {
  operation: string;
  totalExecutions: number;
  successCount: number;
  errorCount: number;
  successRate: string;
  avgDuration: string;
  minDuration: string;
  maxDuration: string;
}
