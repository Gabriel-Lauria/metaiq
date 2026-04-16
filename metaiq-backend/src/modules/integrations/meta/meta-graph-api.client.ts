import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class MetaGraphApiClient {
  constructor(private readonly config: ConfigService) {}

  async get<T>(
    pathOrUrl: string,
    accessToken: string,
    params?: Record<string, string | number>,
    timeout = 15000,
  ): Promise<T> {
    const response = await axios.get(this.resolveUrl(pathOrUrl), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params,
      timeout,
    });
    return response.data as T;
  }

  async post<T>(
    path: string,
    accessToken: string,
    payload: Record<string, string | number>,
    timeout = 20000,
  ): Promise<T> {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      body.set(key, String(value));
    }
    body.set('access_token', accessToken);

    const response = await axios.post(this.resolveUrl(path), body, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout,
    });

    return response.data as T;
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
}
