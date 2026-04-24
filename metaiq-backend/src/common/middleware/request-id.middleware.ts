import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { RequestContextService } from '../services/request-context.service';

export const REQUEST_ID_HEADER = 'x-request-id';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(REQUEST_ID_HEADER);
    const requestId = incoming?.trim() || randomUUID();
    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    this.requestContext.run(
      {
        requestId,
        method: req.method,
        path: req.originalUrl || req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      },
      next,
    );
  }
}
