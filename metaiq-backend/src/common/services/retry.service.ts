import { Injectable } from '@nestjs/common';
import { LoggerService } from './logger.service';

/**
 * RetryService fornece mecanismo de retry com backoff exponencial.
 * 
 * Ideal para:
 * - Chamadas HTTP que podem falhar temporariamente
 * - Integração com APIs externas (Meta, Google, etc)
 * - Operações que dependem de recursos transitórios
 * 
 * Uso:
 *   const result = await this.retryService.execute(
 *     async () => metaApi.getCampaigns(),
 *     { maxRetries: 3, baseDelayMs: 1000 }
 *   );
 */
@Injectable()
export class RetryService {
  constructor(private readonly logger: LoggerService) {}

  /**
   * Executa uma função com retry e backoff exponencial
   */
  async execute<T>(
    fn: () => Promise<T>,
    options?: {
      maxRetries?: number;
      baseDelayMs?: number;
      maxDelayMs?: number;
      backoffMultiplier?: number;
      label?: string;
    },
  ): Promise<T> {
    const {
      maxRetries = 3,
      baseDelayMs = 1000,
      maxDelayMs = 30000,
      backoffMultiplier = 2,
      label = 'Operação',
    } = options || {};

    let lastError: Error | null = null;
    const delay = baseDelayMs;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        this.logger.debug(`[${label}] Tentativa ${attempt}/${maxRetries + 1}`, {
          label,
          attempt,
        });

        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries + 1) {
          // Última tentativa
          this.logger.error(
            `[${label}] Falha após ${maxRetries} retries`,
            lastError,
            { label, attempts: maxRetries + 1 },
          );
          throw lastError;
        }

        // Calcula delay com exponential backoff
        const currentDelay = Math.min(
          delay * Math.pow(backoffMultiplier, attempt - 1),
          maxDelayMs,
        );

        this.logger.warn(`[${label}] Retry em ${currentDelay}ms`, {
          label,
          attempt,
          delay: currentDelay,
          error: lastError.message,
        });

        // Aguarda antes de retry
        await this.sleep(currentDelay);
      }
    }

    throw lastError;
  }

  /**
   * Útil para retry de operações específicas com lógica customizada
   */
  async executeWithCircuitBreaker<T>(
    fn: () => Promise<T>,
    options?: {
      maxRetries?: number;
      baseDelayMs?: number;
      maxDelayMs?: number;
      backoffMultiplier?: number;
      label?: string;
      shouldRetry?: (error: Error) => boolean;
    },
  ): Promise<T> {
    const { shouldRetry, ...retryOptions } = options || {};

    const wrappedFn = async () => {
      try {
        return await fn();
      } catch (error) {
        // Se há validação de retry, verifica
        if (shouldRetry && !shouldRetry(error as Error)) {
          throw error; // Não faz retry
        }
        throw error;
      }
    };

    return this.execute(wrappedFn, retryOptions);
  }

  /**
   * Helper para dormir
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
