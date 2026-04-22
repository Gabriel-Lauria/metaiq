import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../services/logger.service';

@Injectable()
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private readonly isProduction: boolean;

  constructor(
    private configService: ConfigService,
    private structuredLogger: LoggerService,
  ) {
    this.isProduction = this.configService.get<string>('app.nodeEnv') === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';
    let extra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as any;
        message = responseObj.message || message;
        error = responseObj.error || error;
        const { statusCode: _statusCode, message: _message, error: _error, ...rest } = responseObj;
        extra = rest;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;
    }

    const errorMetadata = {
      requestId: request.requestId,
      status,
      url: request.url,
      method: request.method,
      ip: request.ip,
      userAgent: request.get('User-Agent'),
      details: extra,
    };

    if (this.structuredLogger) {
      this.structuredLogger.error(`HTTP ${status} Error`, exception, errorMetadata);
    } else {
      this.logger.error(`HTTP ${status} Error: ${message}`, errorMetadata);
    }

    // Don't expose stack traces in production
    const errorResponse = {
      statusCode: status,
      message: this.isProduction && status === HttpStatus.INTERNAL_SERVER_ERROR
        ? 'Internal server error'
        : message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: request.requestId,
      ...(this.isProduction ? {} : extra),
    };

    response.status(status).json(errorResponse);
  }
}
