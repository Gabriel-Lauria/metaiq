import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

@Injectable()
export class MetaGraphApiClient {
  private readonly logger = new Logger(MetaGraphApiClient.name);

  constructor(private readonly config: ConfigService) {}

  async get<T>(
    pathOrUrl: string,
    accessToken: string,
    params?: Record<string, string | number>,
    timeout = 15000,
  ): Promise<T> {
    const url = this.resolveUrl(pathOrUrl);

    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params,
        timeout,
      });

      return response.data as T;
    } catch (error) {
      this.logAxiosError('GET', url, params, error);
      throw error;
    }
  }

  async post<T>(
    path: string,
    accessToken: string,
    payload: Record<string, string | number>,
    timeout = 20000,
  ): Promise<T> {
    const url = this.resolveUrl(path);
    const sanitizedPayload = this.sanitizePayload(payload);
    const body = new URLSearchParams();

    for (const [key, value] of Object.entries(payload)) {
      body.set(key, String(value));
    }

    body.set('access_token', accessToken);

    try {
      this.logger.log(
        JSON.stringify({
          event: 'META_GRAPH_POST_REQUEST',
          method: 'POST',
          url,
          payload: sanitizedPayload,
        }),
      );

      const response = await axios.post(url, body, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout,
      });

      this.logger.log(
        JSON.stringify({
          event: 'META_GRAPH_POST_RESPONSE',
          method: 'POST',
          url,
          response: this.sanitizeResponseData(response.data),
        }),
      );

      return response.data as T;
    } catch (error) {
      this.logAxiosError('POST', url, sanitizedPayload, error);
      throw error;
    }
  }

  async delete<T>(
    path: string,
    accessToken: string,
    timeout = 15000,
  ): Promise<T> {
    const url = this.resolveUrl(path);
    const body = new URLSearchParams();
    body.set('access_token', accessToken);

    try {
      this.logger.log(
        JSON.stringify({
          event: 'META_GRAPH_DELETE_REQUEST',
          method: 'DELETE',
          url,
        }),
      );

      const response = await axios.delete(url, {
        data: body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout,
      });

      this.logger.log(
        JSON.stringify({
          event: 'META_GRAPH_DELETE_RESPONSE',
          method: 'DELETE',
          url,
          response: this.sanitizeResponseData(response.data),
        }),
      );

      return response.data as T;
    } catch (error) {
      this.logAxiosError('DELETE', url, undefined, error);
      throw error;
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
    method: 'GET' | 'POST',
    url: string,
    payloadOrParams: Record<string, unknown> | undefined,
    error: unknown,
  ): void {
    const axiosError = error as AxiosError<any>;
    const responseData = axiosError.response?.data;
    const metaError = responseData?.error;

    this.logger.error(
      JSON.stringify({
        event: 'META_GRAPH_API_ERROR',
        method,
        url,
        payload: payloadOrParams ?? null,
        status: axiosError.response?.status ?? null,
        code: metaError?.code ?? null,
        subcode: metaError?.error_subcode ?? null,
        type: metaError?.type ?? null,
        message: metaError?.message ?? axiosError.message ?? 'Unknown error',
        errorUserTitle: metaError?.error_user_title ?? null,
        errorUserMsg: metaError?.error_user_msg ?? null,
        errorData: metaError?.error_data ?? null,
        fbtraceId: metaError?.fbtrace_id ?? null,
        blameFieldSpecs: metaError?.error_data?.blame_field_specs ?? null,
      }),
    );
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
}