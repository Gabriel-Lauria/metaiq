import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { RetryService } from '../../../common/services/retry.service';

export interface MetaGraphApiRetryContext {
  requestId?: string;
  executionId?: string;
  idempotencyKey?: string;
  actorId?: string;
  tenantId?: string | null;
  storeId?: string;
  endpoint?: string;
}

export interface MetaGraphApiErrorPayload {
  status: number | null;
  metaMessage: string | null;
  metaType: string | null;
  metaCode: number | null;
  metaSubcode: number | null;
  metaUserTitle: string | null;
  metaUserMessage: string | null;
  fbtraceId: string | null;
  endpoint: string;
  method: 'GET' | 'GET_PUBLIC' | 'POST' | 'POST_MULTIPART' | 'DELETE';
}

export class MetaGraphApiException extends Error {
  constructor(
    readonly payload: MetaGraphApiErrorPayload,
    readonly cause?: unknown,
  ) {
    super(payload.metaMessage || 'Erro ao chamar a Meta Graph API');
    this.name = 'MetaGraphApiException';
  }
}

@Injectable()
export class MetaGraphApiClient {
  private readonly logger = new Logger(MetaGraphApiClient.name);

  constructor(
    private readonly config: ConfigService,
    private readonly retryService: RetryService,
  ) {}

  async get<T>(
    pathOrUrl: string,
    accessToken: string,
    params?: Record<string, string | number>,
    timeout = 15000,
    context: MetaGraphApiRetryContext = {},
  ): Promise<T> {
    const url = this.resolveUrl(pathOrUrl);
    const endpoint = context.endpoint ?? this.extractEndpoint(url);

    try {
      return await this.retryService.executeWithCircuitBreaker(
        async () => {
          const response = await axios.get(url, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            params,
            timeout,
          });

          return response.data as T;
        },
        {
          label: `MetaGraph ${endpoint}`,
          maxRetries: 3,
          baseDelayMs: 500,
          metadata: this.retryMetadata(context, endpoint),
          shouldRetry: (error) => this.shouldRetryMetaError(this.buildMetaGraphApiException('GET', endpoint, error)),
        },
      );
    } catch (error) {
      this.logAxiosError('GET', url, params, error, context);
      throw this.buildMetaGraphApiException('GET', endpoint, error);
    }
  }

  async getPublic<T>(
    pathOrUrl: string,
    params?: Record<string, string | number>,
    timeout = 15000,
    context: MetaGraphApiRetryContext = {},
  ): Promise<T> {
    const url = this.resolveUrl(pathOrUrl);
    const endpoint = context.endpoint ?? this.extractEndpoint(url);

    try {
      return await this.retryService.executeWithCircuitBreaker(
        async () => {
          const response = await axios.get(url, {
            params,
            timeout,
          });

          return response.data as T;
        },
        {
          label: `MetaGraph ${endpoint}`,
          maxRetries: 3,
          baseDelayMs: 500,
          metadata: this.retryMetadata(context, endpoint),
          shouldRetry: (error) => this.shouldRetryMetaError(this.buildMetaGraphApiException('GET_PUBLIC', endpoint, error)),
        },
      );
    } catch (error) {
      this.logAxiosError('GET_PUBLIC', url, params, error, context);
      throw this.buildMetaGraphApiException('GET_PUBLIC', endpoint, error);
    }
  }

  async post<T>(
    path: string,
    accessToken: string,
    payload: Record<string, string | number>,
    timeout = 20000,
    context: MetaGraphApiRetryContext = {},
  ): Promise<T> {
    const url = this.resolveUrl(path);
    const endpoint = context.endpoint ?? this.extractEndpoint(url);
    const sanitizedPayload = this.sanitizePayload(payload);
    const body = new URLSearchParams();

    for (const [key, value] of Object.entries(payload)) {
      body.set(key, String(value));
    }

    body.set('access_token', accessToken);

    this.logger.log(
      JSON.stringify({
        event: 'META_GRAPH_POST_REQUEST',
        method: 'POST',
        url,
        ...this.retryMetadata(context, endpoint),
        payload: sanitizedPayload,
      }),
    );

    try {
      const result = await this.retryService.executeWithCircuitBreaker(
        async () => {
          const response = await axios.post(url, body, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout,
          });

          return response.data as T;
        },
        {
          label: `MetaGraph ${endpoint}`,
          // Mutations against Meta are not safe to replay automatically because the
          // first attempt may have created a resource before the timeout/error surfaced.
          maxRetries: 0,
          baseDelayMs: 500,
          metadata: this.retryMetadata(context, endpoint),
          shouldRetry: (error) => this.shouldRetryMetaError(this.buildMetaGraphApiException('POST', endpoint, error)),
        },
      );

      this.logger.log(
        JSON.stringify({
          event: 'META_GRAPH_POST_RESPONSE',
          method: 'POST',
          url,
          ...this.retryMetadata(context, endpoint),
          response: this.sanitizeResponseData(result),
        }),
      );

      return result;
    } catch (error) {
      this.logAxiosError('POST', url, sanitizedPayload, error, context);
      throw this.buildMetaGraphApiException('POST', endpoint, error);
    }
  }

  async postMultipart<T>(
    path: string,
    accessToken: string,
    files: Record<string, { filename: string; contentType: string; buffer: Buffer }>,
    timeout = 30000,
    context: MetaGraphApiRetryContext = {},
  ): Promise<T> {
    const url = this.resolveUrl(path);
    const endpoint = context.endpoint ?? this.extractEndpoint(url);
    const sanitizedFiles = Object.fromEntries(
      Object.entries(files).map(([fieldName, file]) => [
        fieldName,
        { filename: file.filename, contentType: file.contentType, sizeBytes: file.buffer.byteLength },
      ]),
    );

    this.logger.log(
      JSON.stringify({
        event: 'META_GRAPH_POST_MULTIPART_REQUEST',
        method: 'POST_MULTIPART',
        url,
        ...this.retryMetadata(context, endpoint),
        files: sanitizedFiles,
      }),
    );

    try {
      const result = await this.retryService.executeWithCircuitBreaker(
        async () => {
          const form = new FormData();
          for (const [fieldName, file] of Object.entries(files)) {
            const multipartField = fieldName === 'bytes' ? 'source' : fieldName;
            form.append(multipartField, new Blob([file.buffer], { type: file.contentType }), file.filename);
          }

          form.append('access_token', accessToken);

          const response = await axios.post(url, form, { timeout });
          return response.data as T;
        },
        {
          label: `MetaGraph ${endpoint}`,
          // Upload retries can create duplicate image assets/hashes when Meta already
          // processed the first request, so recovery must be explicit instead.
          maxRetries: 0,
          baseDelayMs: 500,
          metadata: this.retryMetadata(context, endpoint),
          shouldRetry: (error) => this.shouldRetryMetaError(this.buildMetaGraphApiException('POST_MULTIPART', endpoint, error)),
        },
      );

      this.logger.log(
        JSON.stringify({
          event: 'META_GRAPH_POST_MULTIPART_RESPONSE',
          method: 'POST_MULTIPART',
          url,
          ...this.retryMetadata(context, endpoint),
          response: this.sanitizeResponseData(result),
        }),
      );

      return result;
    } catch (error) {
      const metaException = this.buildMetaGraphApiException('POST_MULTIPART', endpoint, error);
      this.logger.error(
        JSON.stringify({
          event: 'META_GRAPH_API_MULTIPART_ERROR',
          ...metaException.payload,
          ...this.retryMetadata(context, endpoint),
          files: sanitizedFiles,
        }),
      );
      throw metaException;
    }
  }

  async delete<T>(
    path: string,
    accessToken: string,
    timeout = 15000,
    context: MetaGraphApiRetryContext = {},
  ): Promise<T> {
    const url = this.resolveUrl(path);
    const endpoint = context.endpoint ?? this.extractEndpoint(url);
    const body = new URLSearchParams();
    body.set('access_token', accessToken);

    this.logger.log(
      JSON.stringify({
        event: 'META_GRAPH_DELETE_REQUEST',
        method: 'DELETE',
        url,
        ...this.retryMetadata(context, endpoint),
      }),
    );

    try {
      const result = await this.retryService.executeWithCircuitBreaker(
        async () => {
          const response = await axios.delete(url, {
            data: body,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout,
          });

          return response.data as T;
        },
        {
          label: `MetaGraph ${endpoint}`,
          maxRetries: 0,
          baseDelayMs: 500,
          metadata: this.retryMetadata(context, endpoint),
          shouldRetry: (error) => this.shouldRetryMetaError(this.buildMetaGraphApiException('DELETE', endpoint, error)),
        },
      );

      this.logger.log(
        JSON.stringify({
          event: 'META_GRAPH_DELETE_RESPONSE',
          method: 'DELETE',
          url,
          ...this.retryMetadata(context, endpoint),
          response: this.sanitizeResponseData(result),
        }),
      );

      return result;
    } catch (error) {
      this.logAxiosError('DELETE', url, undefined, error, context);
      throw this.buildMetaGraphApiException('DELETE', endpoint, error);
    }
  }

  private resolveUrl(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) {
      return pathOrUrl;
    }

    const path = pathOrUrl.startsWith('/') ? pathOrUrl.slice(1) : pathOrUrl;
    return `https://graph.facebook.com/${this.metaApiVersion()}/${path}`;
  }

  private metaApiVersion(): string {
    return this.config.get<string>('meta.apiVersion') || 'v19.0';
  }

  private logAxiosError(
    method: 'GET' | 'GET_PUBLIC' | 'POST' | 'DELETE',
    url: string,
    payloadOrParams: Record<string, unknown> | undefined,
    error: unknown,
    context: MetaGraphApiRetryContext,
  ): void {
    const endpoint = context.endpoint ?? this.extractEndpoint(url);
    const metaException = this.buildMetaGraphApiException(method, endpoint, error);

    this.logger.error(
      JSON.stringify({
        event: 'META_GRAPH_API_ERROR',
        ...metaException.payload,
        ...this.retryMetadata(context, endpoint),
        url,
        payload: payloadOrParams ?? null,
      }),
    );
  }

  private buildMetaGraphApiException(
    method: 'GET' | 'GET_PUBLIC' | 'POST' | 'POST_MULTIPART' | 'DELETE',
    endpoint: string,
    error: unknown,
  ): MetaGraphApiException {
    if (error instanceof MetaGraphApiException) {
      return error;
    }

    const axiosError = error as AxiosError<any>;
    const responseData = axiosError.response?.data;
    const metaError = responseData?.error;

    return new MetaGraphApiException({
      status: axiosError.response?.status ?? null,
      metaMessage: this.sanitizeText(metaError?.message ?? axiosError.message ?? 'Unknown error'),
      metaType: this.sanitizeText(metaError?.type ?? null),
      metaCode: typeof metaError?.code === 'number' ? metaError.code : null,
      metaSubcode: typeof metaError?.error_subcode === 'number' ? metaError.error_subcode : null,
      metaUserTitle: this.sanitizeText(metaError?.error_user_title ?? null),
      metaUserMessage: this.sanitizeText(metaError?.error_user_msg ?? null),
      fbtraceId: this.sanitizeText(metaError?.fbtrace_id ?? null),
      endpoint,
      method,
    }, error);
  }

  private shouldRetryMetaError(error: MetaGraphApiException): boolean {
    const status = error.payload.status;
    const code = error.payload.metaCode;
    const message = `${error.payload.metaMessage || ''} ${error.payload.metaUserMessage || ''}`.toLowerCase();
    const cause = error.cause as NodeJS.ErrnoException | AxiosError | undefined;
    const networkCode = cause && 'code' in cause ? cause.code : undefined;

    if (status && [400, 401, 403, 404].includes(status)) {
      return false;
    }

    if (code && [10, 100, 190, 200].includes(code)) {
      return false;
    }

    if (status && [429, 500, 502, 503, 504].includes(status)) {
      return true;
    }

    if (networkCode && ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN'].includes(networkCode)) {
      return true;
    }

    return message.includes('timeout');
  }

  private retryMetadata(
    context: MetaGraphApiRetryContext,
    endpoint: string,
  ): Record<string, unknown> {
    return {
      requestId: context.requestId,
      executionId: context.executionId,
      idempotencyKey: context.idempotencyKey,
      actorId: context.actorId,
      tenantId: context.tenantId,
      storeId: context.storeId,
      endpoint,
    };
  }

  private sanitizePayload(payload: Record<string, string | number>): Record<string, string | number> {
    const sanitized: Record<string, string | number> = {};

    for (const [key, value] of Object.entries(payload)) {
      if (this.isSensitiveKey(key)) {
        sanitized[key] = '[redacted]';
        continue;
      }

      sanitized[key] = value;
    }

    return sanitized;
  }

  private sanitizeResponseData(data: unknown): unknown {
    if (!data || typeof data !== 'object') {
      return data;
    }

    try {
      return JSON.parse(
        JSON.stringify(data, (key, value) => {
          if (this.isSensitiveKey(key)) {
            return '[redacted]';
          }
          return value;
        }),
      );
    } catch {
      return '[unserializable-response]';
    }
  }

  private isSensitiveKey(key: string): boolean {
    const normalized = key.toLowerCase();
    return normalized === 'access_token' || normalized === 'client_secret' || normalized === 'refresh_token';
  }

  private extractEndpoint(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.pathname.replace(/^\/[^/]+/, '') || parsed.pathname;
    } catch {
      return url;
    }
  }

  private sanitizeText(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    return value.replace(/[?&](access_token|client_secret|code)=[^&\s]+/gi, '$1=[redacted]').slice(0, 500);
  }
}
