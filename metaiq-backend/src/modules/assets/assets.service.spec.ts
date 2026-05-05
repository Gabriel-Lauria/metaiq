import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AccessScopeService } from '../../common/services/access-scope.service';
import { Asset } from './entities/asset.entity';
import { AssetsService } from './assets.service';

function buildPngBuffer(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(buffer, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe('AssetsService', () => {
  const user = {
    id: 'user-1',
    email: 'user@metaiq.dev',
    role: 'OPERATIONAL',
    tenantId: 'tenant-1',
  } as any;

  let service: AssetsService;
  let repository: any;
  let accessScope: any;
  let uploadDir: string;

  beforeEach(async () => {
    uploadDir = mkdtempSync(join(tmpdir(), 'metaiq-assets-'));
    repository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({
        id: value.id ?? 'asset-1',
        createdAt: value.createdAt ?? new Date('2026-04-27T10:00:00Z'),
        updatedAt: new Date('2026-04-27T10:00:00Z'),
        ...value,
      })),
      find: jest.fn(async () => []),
      findOne: jest.fn(),
    };
    accessScope = {
      validateStoreAccess: jest.fn(async (_currentUser: unknown, storeId: string) => {
        if (storeId !== 'store-1') {
          throw new BadRequestException('Store não encontrada');
        }
        return { id: storeId };
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AssetsService,
        {
          provide: getRepositoryToken(Asset),
          useValue: repository,
        },
        {
          provide: AccessScopeService,
          useValue: accessScope,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'app') {
                return {
                  backendUrl: 'http://localhost:3004',
                  assetUploadDir: uploadDir,
                  cryptoSecret: 'test-secret',
                };
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AssetsService);
  });

  afterEach(() => {
    rmSync(uploadDir, { recursive: true, force: true });
  });

  it('faz upload valido de imagem e retorna dimensoes e URL publica', async () => {
    const result = await service.uploadForUser(user, 'store-1', {
      originalname: 'criativo.png',
      mimetype: 'image/png',
      size: 1024,
      buffer: buildPngBuffer(1200, 628),
    });

    expect(result.id).toBe('asset-1');
    expect(result.storageUrl).toContain('http://localhost:3004/api/assets/asset-1/content');
    expect(result.storageUrl).toContain('signature=');
    expect(result.width).toBe(1200);
    expect(result.height).toBe(628);
    expect(result.status).toBe('VALIDATED');
  });

  it('mantem upload legado valido com adAccountId nulo', async () => {
    await service.uploadForUser(user, 'store-1', {
      originalname: 'criativo.png',
      mimetype: 'image/png',
      size: 1024,
      buffer: buildPngBuffer(1200, 628),
    });

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      storeId: 'store-1',
      uploadedByUserId: 'user-1',
      adAccountId: null,
      status: 'VALIDATED',
    }));
  });

  it('lista assets da store mesmo quando adAccountId e nulo', async () => {
    repository.find.mockResolvedValueOnce([
      {
        id: 'asset-1',
        storeId: 'store-1',
        uploadedByUserId: 'user-1',
        adAccountId: null,
        type: 'image',
        originalName: 'criativo.png',
        fileName: 'criativo-asset.png',
        mimeType: 'image/png',
        size: 1024,
        width: 1200,
        height: 628,
        storageUrl: '',
        metaImageHash: null,
        metaRawImageId: null,
        metaRawResponse: null,
        status: 'VALIDATED',
        createdAt: new Date('2026-04-27T10:00:00Z'),
        updatedAt: new Date('2026-04-27T11:00:00Z'),
      },
    ]);

    const result = await service.listForUser(user, 'store-1', 'image');

    expect(repository.find).toHaveBeenCalledWith({
      where: { storeId: 'store-1', type: 'image' },
      order: { createdAt: 'DESC' },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      id: 'asset-1',
      storeId: 'store-1',
      adAccountId: null,
      type: 'image',
      status: 'VALIDATED',
    }));
  });

  it('rejeita formato invalido com mensagem especifica', async () => {
    await expect(service.uploadForUser(user, 'store-1', {
      originalname: 'arquivo.txt',
      mimetype: 'text/plain',
      size: 50,
      buffer: Buffer.from('invalid'),
    })).rejects.toThrow('Formato inválido');
  });

  it('rejeita imagem acima de 4MB com mensagem especifica', async () => {
    await expect(service.uploadForUser(user, 'store-1', {
      originalname: 'grande.png',
      mimetype: 'image/png',
      size: 4 * 1024 * 1024 + 1,
      buffer: Buffer.alloc(4 * 1024 * 1024 + 1),
    })).rejects.toThrow('Imagem muito grande');
  });

  it('rejeita store fora do escopo do usuario', async () => {
    await expect(service.uploadForUser(user, 'store-invalida', {
      originalname: 'criativo.png',
      mimetype: 'image/png',
      size: 1024,
      buffer: buildPngBuffer(1200, 628),
    })).rejects.toThrow('Store não encontrada');
  });
});
