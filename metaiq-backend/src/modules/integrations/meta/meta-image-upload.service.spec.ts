import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { MetaGraphApiClient } from './meta-graph-api.client';
import { MetaImageUploadService } from './meta-image-upload.service';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MetaImageUploadService', () => {
  let service: MetaImageUploadService;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'meta.apiVersion') return 'v19.0';
        return undefined;
      }),
    } as unknown as ConfigService;

    service = new MetaImageUploadService(new MetaGraphApiClient(config));
  });

  it('faz download da imagem, envia para a Meta e retorna image_hash', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: Buffer.from('fake-image'),
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
    )).rejects.toThrow('imageUrl deve apontar para uma imagem direta válida');

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
});
