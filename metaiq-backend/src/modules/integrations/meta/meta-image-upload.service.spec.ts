import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { MetaGraphApiClient } from './meta-graph-api.client';
import { MetaImageUploadService } from './meta-image-upload.service';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

function pngBuffer(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(buffer, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe('MetaImageUploadService', () => {
  let service: MetaImageUploadService;
  const retryService = {
    executeWithCircuitBreaker: jest.fn(async <T>(fn: () => Promise<T>) => fn()),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'meta.apiVersion') return 'v19.0';
        return undefined;
      }),
    } as unknown as ConfigService;

    service = new MetaImageUploadService(new MetaGraphApiClient(config, retryService as any));
  });

  it('faz download da imagem, envia para a Meta e retorna image_hash', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: pngBuffer(1200, 628),
      headers: { 'content-type': 'image/png' },
    } as any);
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        images: {
          'banner.png': {
            hash: 'meta-image-hash-1',
          },
        },
      },
    } as any);

    const result = await service.uploadImageFromUrl(
      'meta-token',
      'act_123',
      'https://cdn.metaiq.dev/banner.png',
      { executionId: 'creation-1', storeId: 'store-1' },
    );

    expect(result).toBe('meta-image-hash-1');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://graph.facebook.com/v19.0/act_123/adimages',
      expect.any(FormData),
      expect.objectContaining({ timeout: 30000 }),
    );
  });

  it('bloqueia imageUrl que nao parece imagem direta', async () => {
    await expect(service.uploadImageFromUrl(
      'meta-token',
      'act_123',
      'https://www.google.com/imgres?imgurl=https://cdn.metaiq.dev/banner.png',
    )).rejects.toThrow('imageUrl deve apontar para uma imagem direta valida');

    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('falha com erro claro quando o content-type nao eh imagem valida', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: Buffer.from('<html>preview</html>'),
      headers: { 'content-type': 'text/html' },
    } as any);

    await expect(service.uploadImageFromUrl(
      'meta-token',
      'act_123',
      'https://metaiq.dev/preview',
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('falha com erro claro quando o binario nao corresponde ao mime type', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: Buffer.from('not-a-real-png'),
      headers: { 'content-type': 'image/png' },
    } as any);

    await expect(service.uploadImageFromUrl(
      'meta-token',
      'act_123',
      'https://cdn.metaiq.dev/banner.png',
    )).rejects.toThrow('PNG invalido');

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('bloqueia imagem abaixo da resolucao minima operacional', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: pngBuffer(300, 200),
      headers: { 'content-type': 'image/png' },
    } as any);

    await expect(service.uploadImageFromUrl(
      'meta-token',
      'act_123',
      'https://cdn.metaiq.dev/banner.png',
    )).rejects.toThrow('600x314');

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
