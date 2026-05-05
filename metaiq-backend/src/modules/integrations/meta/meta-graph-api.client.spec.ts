import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { MetaGraphApiClient } from './meta-graph-api.client';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MetaGraphApiClient mutation retry policy', () => {
  let client: MetaGraphApiClient;
  let retryService: { executeWithCircuitBreaker: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ data: { id: 'meta-1' } } as any);
    mockedAxios.delete.mockResolvedValue({ data: { success: true } } as any);

    retryService = {
      executeWithCircuitBreaker: jest.fn(async <T>(_fn: () => Promise<T>, options?: { maxRetries?: number }) => {
        expect(options?.maxRetries).toBe(0);
        return _fn();
      }),
    };

    client = new MetaGraphApiClient(
      {
        get: jest.fn((key: string) => {
          if (key === 'meta.apiVersion') return 'v19.0';
          return undefined;
        }),
      } as unknown as ConfigService,
      retryService as any,
    );
  });

  it('does not auto-retry POST mutations that create Meta resources', async () => {
    await client.post('act_123/campaigns', 'token-1', { name: 'Campanha', status: 'PAUSED' });

    expect(retryService.executeWithCircuitBreaker).toHaveBeenCalled();
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('does not auto-retry multipart uploads that can duplicate image assets', async () => {
    await client.postMultipart(
      'act_123/adimages',
      'token-1',
      {
        bytes: {
          filename: 'creative.jpg',
          contentType: 'image/jpeg',
          buffer: Buffer.from('img'),
        },
      },
    );

    expect(retryService.executeWithCircuitBreaker).toHaveBeenCalled();
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('does not auto-retry DELETE mutations during cleanup', async () => {
    await client.delete('123456789', 'token-1');

    expect(retryService.executeWithCircuitBreaker).toHaveBeenCalled();
    expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
  });
});
