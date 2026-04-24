import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AuthenticatedUser } from '../interfaces';
import { LoggerService } from '../services/logger.service';
import { MetricsService } from '../services/metrics.service';
import { RequestContextService } from '../services/request-context.service';

@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: LoggerService,
    private readonly metrics: MetricsService,
    private readonly requestContext: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();
    request.startTime = startedAt;

    const user = request.user as AuthenticatedUser | undefined;
    if (user) {
      this.requestContext.merge({
        userId: user.id,
        tenantId: user.tenantId,
        userRole: user.role,
      });
    }

    const metadata = {
      module: 'http',
      requestId: request.requestId,
      method: request.method,
      path: request.originalUrl || request.url,
      userId: user?.id,
      tenantId: user?.tenantId,
      userRole: user?.role,
    };

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - startedAt;
        const statusCode = response.statusCode;
        this.metrics.record('http.request', durationMs, statusCode < 500, {
          ...metadata,
          statusCode,
        });
        this.logger.info('HTTP_REQUEST_COMPLETED', {
          ...metadata,
          statusCode,
          durationMs,
        });
      }),
      catchError((error) => {
        const durationMs = Date.now() - startedAt;
        const statusCode = typeof error?.getStatus === 'function' ? error.getStatus() : 500;
        this.metrics.record('http.request', durationMs, false, {
          ...metadata,
          statusCode,
          errorName: error?.name,
        });
        return throwError(() => error);
      }),
    );
  }
}
