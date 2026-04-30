import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { MetaGraphApiClient } from './meta-graph-api.client';
import { isLikelyDirectImageUrl, isValidMetaHttpUrl } from './meta-creative.validation';

interface MetaImageUploadContext {
  requestId?: string;
  executionId?: string;
  idempotencyKey?: string;
  actorId?: string;
  tenantId?: string | null;
  storeId?: string;
  adAccountExternalId?: string;
}

interface DownloadedImageAsset {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

interface MetaAdImageUploadResponse {
  images?: Record<string, { hash?: string }>;
}

@Injectable()
export class MetaImageUploadService {
  private readonly logger = new Logger(MetaImageUploadService.name);
  private readonly downloadTimeoutMs = 15000;
  private readonly uploadTimeoutMs = 30000;
  private readonly allowedContentTypes = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
  ]);
  private readonly riskyImageHosts = new Set(['picsum.photos', 'placehold.co', 'via.placeholder.com']);

  constructor(private readonly graphApi: MetaGraphApiClient) {}

  async uploadImageFromUrl(
    accessToken: string,
    adAccountExternalId: string,
    imageUrl: string,
    context: MetaImageUploadContext = {},
  ): Promise<string> {
    const normalizedImageUrl = imageUrl.trim();

    if (!isValidMetaHttpUrl(normalizedImageUrl)) {
      throw new BadRequestException('imageUrl deve ser uma URL http(s) válida antes do upload para a Meta');
    }

    if (!isLikelyDirectImageUrl(normalizedImageUrl)) {
      throw new BadRequestException('imageUrl deve apontar para uma imagem direta válida antes do upload para a Meta');
    }

    const hostname = this.safeHostname(normalizedImageUrl);
    if (hostname && this.riskyImageHosts.has(hostname)) {
      this.log('META_IMAGE_URL_RISK_WARNING', {
        ...context,
        imageUrl: normalizedImageUrl,
        hostname,
        warning: 'Imagem usa domínio dinâmico/de teste e pode gerar risco operacional.',
      });
    }

    this.log('META_IMAGE_DOWNLOAD_START', {
      ...context,
      imageUrl: normalizedImageUrl,
    });

    const downloaded = await this.downloadImage(normalizedImageUrl, context);

    this.log('META_IMAGE_UPLOAD_START', {
      ...context,
      filename: downloaded.filename,
      contentType: downloaded.contentType,
      sizeBytes: downloaded.buffer.byteLength,
    });

    const response = await this.graphApi.postMultipart<MetaAdImageUploadResponse>(
      `${adAccountExternalId.trim()}/adimages`,
      accessToken,
      {
        bytes: {
          filename: downloaded.filename,
          contentType: downloaded.contentType,
          buffer: downloaded.buffer,
        },
      },
      this.uploadTimeoutMs,
      {
        requestId: context.requestId,
        executionId: context.executionId,
        idempotencyKey: context.idempotencyKey,
        actorId: context.actorId,
        tenantId: context.tenantId,
        storeId: context.storeId,
        endpoint: `${adAccountExternalId.trim()}/adimages`,
      },
    );

    const imageHash = this.extractImageHash(response);

    this.log('META_IMAGE_UPLOAD_SUCCESS', {
      ...context,
      imageHash,
      filename: downloaded.filename,
    });

    return imageHash;
  }

  private async downloadImage(imageUrl: string, context: MetaImageUploadContext): Promise<DownloadedImageAsset> {
    try {
      const response = await axios.get<ArrayBuffer>(imageUrl, {
        responseType: 'arraybuffer',
        timeout: this.downloadTimeoutMs,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 300,
      });

      const contentTypeHeader = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!this.allowedContentTypes.has(contentTypeHeader)) {
        this.log('META_IMAGE_DOWNLOAD_INVALID_CONTENT_TYPE', {
          ...context,
          imageUrl,
          contentType: contentTypeHeader || null,
        });
        throw new BadRequestException('A URL da imagem retornou um content-type inválido para upload na Meta');
      }

      const buffer = Buffer.from(response.data);
      if (!buffer.byteLength) {
        throw new BadRequestException('A imagem informada não retornou conteúdo para upload na Meta');
      }

      return {
        buffer,
        contentType: contentTypeHeader,
        filename: this.resolveFilename(imageUrl, contentTypeHeader),
      };
    } catch (error) {
      this.log('META_IMAGE_DOWNLOAD_FAILED', {
        ...context,
        imageUrl,
        error: (error as Error).message,
      });
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Não foi possível baixar a imagem para envio à Meta');
    }
  }

  private extractImageHash(response: MetaAdImageUploadResponse | null | undefined): string {
    const imageEntry = response?.images ? Object.values(response.images)[0] : undefined;
    const hash = imageEntry?.hash?.trim();
    if (!hash) {
      throw new BadRequestException('A Meta não retornou image_hash após o upload da imagem');
    }
    return hash;
  }

  private resolveFilename(imageUrl: string, contentType: string): string {
    try {
      const parsed = new URL(imageUrl);
      const fromPath = parsed.pathname.split('/').pop()?.trim();
      if (fromPath && /\.[a-z0-9]+$/i.test(fromPath)) {
        return fromPath.slice(0, 120);
      }
    } catch {
      // ignore and fallback to generated filename
    }

    const extension = this.extensionFromContentType(contentType);
    return `metaiq-creative.${extension}`;
  }

  private extensionFromContentType(contentType: string): string {
    switch (contentType) {
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      case 'image/gif':
        return 'gif';
      case 'image/avif':
        return 'avif';
      default:
        return 'jpg';
    }
  }

  private log(event: string, payload: Record<string, unknown>): void {
    this.logger.log(
      JSON.stringify({
        event,
        ...payload,
      }),
    );
  }

  private safeHostname(value: string): string | null {
    try {
      return new URL(value).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
}
