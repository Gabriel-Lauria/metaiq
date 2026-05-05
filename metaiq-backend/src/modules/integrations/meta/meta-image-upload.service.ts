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
  width: number;
  height: number;
}

interface MetaAdImageUploadResponse {
  images?: Record<string, { hash?: string }>;
}

@Injectable()
export class MetaImageUploadService {
  private readonly logger = new Logger(MetaImageUploadService.name);
  private readonly downloadTimeoutMs = 15000;
  private readonly uploadTimeoutMs = 30000;
  private readonly maxImageSizeBytes = 4 * 1024 * 1024;
  private readonly minImageWidth = 600;
  private readonly minImageHeight = 314;
  private readonly allowedContentTypes = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
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
      throw new BadRequestException('imageUrl deve ser uma URL http(s) valida antes do upload para a Meta');
    }

    if (!isLikelyDirectImageUrl(normalizedImageUrl)) {
      throw new BadRequestException('imageUrl deve apontar para uma imagem direta valida antes do upload para a Meta');
    }

    const hostname = this.safeHostname(normalizedImageUrl);
    if (hostname && this.riskyImageHosts.has(hostname)) {
      this.log('META_IMAGE_URL_RISK_WARNING', {
        ...context,
        imageUrl: normalizedImageUrl,
        hostname,
        warning: 'Imagem usa dominio dinamico/de teste e pode gerar risco operacional.',
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
      width: downloaded.width,
      height: downloaded.height,
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
        throw new BadRequestException('A URL da imagem retornou um content-type invalido para upload na Meta');
      }

      const buffer = Buffer.from(response.data);
      if (!buffer.byteLength) {
        throw new BadRequestException('A imagem informada nao retornou conteudo para upload na Meta');
      }

      if (buffer.byteLength > this.maxImageSizeBytes) {
        this.log('META_IMAGE_DOWNLOAD_TOO_LARGE', {
          ...context,
          imageUrl,
          sizeBytes: buffer.byteLength,
        });
        throw new BadRequestException('A imagem excede o limite operacional seguro de 4MB para publicacao na Meta');
      }

      const dimensions = this.readImageDimensions(buffer, contentTypeHeader);
      this.assertMinimumDimensions(dimensions, imageUrl, context);
      this.log('META_IMAGE_DIMENSIONS_VALIDATED', {
        ...context,
        imageUrl,
        contentType: contentTypeHeader,
        width: dimensions.width,
        height: dimensions.height,
      });

      return {
        buffer,
        contentType: contentTypeHeader,
        filename: this.resolveFilename(imageUrl, contentTypeHeader),
        width: dimensions.width,
        height: dimensions.height,
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
      throw new BadRequestException('Nao foi possivel baixar a imagem para envio a Meta');
    }
  }

  private extractImageHash(response: MetaAdImageUploadResponse | null | undefined): string {
    const imageEntry = response?.images ? Object.values(response.images)[0] : undefined;
    const hash = imageEntry?.hash?.trim();
    if (!hash) {
      throw new BadRequestException('A Meta nao retornou image_hash apos o upload da imagem');
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
      default:
        return 'jpg';
    }
  }

  private assertMinimumDimensions(
    dimensions: { width: number; height: number },
    imageUrl: string,
    context: MetaImageUploadContext,
  ): void {
    if (dimensions.width >= this.minImageWidth && dimensions.height >= this.minImageHeight) {
      return;
    }

    this.log('META_IMAGE_DOWNLOAD_INVALID_DIMENSIONS', {
      ...context,
      imageUrl,
      width: dimensions.width,
      height: dimensions.height,
      minWidth: this.minImageWidth,
      minHeight: this.minImageHeight,
    });
    throw new BadRequestException(
      `A imagem precisa ter pelo menos ${this.minImageWidth}x${this.minImageHeight} para publicacao na Meta`,
    );
  }

  private readImageDimensions(buffer: Buffer, mimeType: string): { width: number; height: number } {
    if (mimeType === 'image/png') {
      return this.readPngDimensions(buffer);
    }

    if (mimeType === 'image/webp') {
      return this.readWebpDimensions(buffer);
    }

    return this.readJpegDimensions(buffer);
  }

  private readPngDimensions(buffer: Buffer): { width: number; height: number } {
    const pngSignature = '89504e470d0a1a0a';
    if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== pngSignature) {
      throw new BadRequestException('A URL da imagem retornou um PNG invalido para upload na Meta');
    }

    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  private readJpegDimensions(buffer: Buffer): { width: number; height: number } {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
      throw new BadRequestException('A URL da imagem retornou um JPEG invalido para upload na Meta');
    }

    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = buffer[offset + 1];
      const blockLength = buffer.readUInt16BE(offset + 2);

      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }

      offset += 2 + blockLength;
    }

    throw new BadRequestException('A URL da imagem retornou um JPEG invalido para upload na Meta');
  }

  private readWebpDimensions(buffer: Buffer): { width: number; height: number } {
    if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
      throw new BadRequestException('A URL da imagem retornou um WEBP invalido para upload na Meta');
    }

    const chunkType = buffer.toString('ascii', 12, 16);
    if (chunkType === 'VP8X') {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }

    if (chunkType === 'VP8 ') {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }

    if (chunkType === 'VP8L') {
      const bits = buffer.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }

    throw new BadRequestException('A URL da imagem retornou um WEBP invalido para upload na Meta');
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
