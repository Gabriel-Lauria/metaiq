import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  requestId?: string;
  method?: string;
  path?: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
  tenantId?: string | null;
  userRole?: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): RequestContext {
    return this.storage.getStore() ?? {};
  }

  merge(context: Partial<RequestContext>): void {
    const current = this.storage.getStore();
    if (!current) {
      return;
    }

    Object.assign(current, context);
  }
}
