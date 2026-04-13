import { SetMetadata } from '@nestjs/common';

export const THROTTLE_KEY = 'THROTTLE_KEY';

/**
 * Decorator para aplicar rate limiting customizado em endpoints específicos
 *
 * Uso:
 * @Throttle('auth', 5)  // 5 requisições por minuto no limite 'auth'
 * @Throttle('refresh', 10)
 */
export const Throttle = (
  keyOrLimit: string | number,
  limit?: number,
) => {
  if (typeof keyOrLimit === 'number') {
    // Assinatura antiga: @Throttle(limit, ttl)
    return SetMetadata(THROTTLE_KEY, {
      limit: keyOrLimit,
      ttl: limit || 60000,
    });
  } else {
    // Nova assinatura: @Throttle('key-name', limit)
    return SetMetadata(THROTTLE_KEY, {
      key: keyOrLimit,
      limit: limit || 10,
    });
  }
};
