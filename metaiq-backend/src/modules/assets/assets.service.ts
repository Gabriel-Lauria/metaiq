import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import { isAbsolute, join, resolve } from 'path';
import { Repository } from 'typeorm';
import { AccessScopeService } from '../../common/services/access-scope.service';
import { AuthenticatedUser } from '../../common/interfaces';
import { AppConfig } from '../../config/app.config';
import { Asset, AssetType } from './entities/asset.entity';

type UploadedFile = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

export interface AssetDto {
  id: string;
  storeId: string;
  uploadedByUserId: string | null;
  type: AssetType;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  storageUrl: string;
  metaImageHash: string | null;
  status: Asset['status'];
  createdAt: Date;
  updatedAt: Date;
}

interface ImageDimensions {
  width: number;
  height: number;
}

@Injectable()
export class AssetsService {
  private readonly imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  private readonly videoMimeTypes = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
  private readonly maxImageSizeBytes = 4 * 1024 * 1024;
  private readonly minImageWidth = 600;
  private readonly minImageHeight = 314;

  constructor(
    @InjectRepository(Asset)
    private readonly assetRepository: Repository<Asset>,
    private readonly accessScope: AccessScopeService,
    private readonly configService: ConfigService,
  ) {}

  async uploadForUser(
    user: AuthenticatedUser,
    storeId: string,
    file: UploadedFile | undefined,
  ): Promise<AssetDto> {
    await this.accessScope.validateStoreAccess(user, storeId);

    if (!file) {
      throw new BadRequestException('Arquivo é obrigatório');
    }

    const mimeType = String(file.mimetype || '').trim().toLowerCase();
    const assetType = this.resolveAssetType(mimeType);
    const asset = this.assetRepository.create({
      storeId,
      uploadedByUserId: user.id,
      type: assetType,
      mimeType,
      size: Number(file.size || 0),
      width: null,
      height: null,
      storageUrl: '',
      metaImageHash: null,
      status: 'UPLOADED',
    });

    if (assetType === 'image') {
      this.assertValidImageFile(file, mimeType);
      const dimensions = this.readImageDimensions(file.buffer, mimeType);
      this.assertMinimumDimensions(dimensions);
      asset.width = dimensions.width;
      asset.height = dimensions.height;
      asset.status = 'VALIDATED';
    }

    const saved = await this.assetRepository.save(asset);
    const storageUrl = this.buildAssetPublicUrl(saved.id);
    saved.storageUrl = storageUrl;
    await this.persistFile(saved, file.buffer);
    const finalized = await this.assetRepository.save(saved);

    return this.toDto(finalized);
  }

  async listForUser(
    user: AuthenticatedUser,
    storeId: string,
    type?: AssetType,
  ): Promise<AssetDto[]> {
    await this.accessScope.validateStoreAccess(user, storeId);
    const where = type ? { storeId, type } : { storeId };
    const assets = await this.assetRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
    return assets.map((asset) => this.toDto(asset));
  }

  async getAssetForStore(storeId: string, assetId: string): Promise<Asset> {
    const asset = await this.assetRepository.findOne({
      where: { id: assetId, storeId },
    });

    if (!asset) {
      throw new BadRequestException('Asset não pertence à store selecionada');
    }

    if (asset.status === 'REJECTED' || asset.status === 'FAILED') {
      throw new BadRequestException('Asset não está disponível para uso');
    }

    return asset;
  }

  async getAssetFileStream(assetId: string): Promise<{
    asset: Asset;
    filePath: string;
  }> {
    const asset = await this.assetRepository.findOne({ where: { id: assetId } });
    if (!asset) {
      throw new NotFoundException('Asset não encontrado');
    }

    const filePath = this.getFilePath(asset);
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException('Arquivo do asset não encontrado');
    }

    return { asset, filePath };
  }

  private resolveAssetType(mimeType: string): AssetType {
    if (this.imageMimeTypes.has(mimeType)) {
      return 'image';
    }

    if (this.videoMimeTypes.has(mimeType)) {
      return 'video';
    }

    throw new BadRequestException('Formato inválido');
  }

  private assertValidImageFile(file: UploadedFile, mimeType: string): void {
    if (!this.imageMimeTypes.has(mimeType)) {
      throw new BadRequestException('Formato inválido');
    }

    if (Number(file.size || 0) > this.maxImageSizeBytes) {
      throw new BadRequestException('Imagem muito grande');
    }
  }

  private assertMinimumDimensions(dimensions: ImageDimensions): void {
    if (dimensions.width < this.minImageWidth || dimensions.height < this.minImageHeight) {
      throw new BadRequestException('Imagem muito pequena');
    }
  }

  private async persistFile(asset: Asset, buffer: Buffer): Promise<void> {
    const filePath = this.getFilePath(asset);
    await fs.mkdir(this.uploadRootDir(), { recursive: true });
    await fs.writeFile(filePath, buffer);
  }

  private getFilePath(asset: Asset): string {
    return join(this.uploadRootDir(), `${asset.id}${this.extensionForMimeType(asset.mimeType)}`);
  }

  private uploadRootDir(): string {
    const appConfig = this.configService.get<AppConfig>('app');
    const configuredDir = appConfig?.assetUploadDir || 'uploads/assets';
    return isAbsolute(configuredDir) ? configuredDir : resolve(process.cwd(), configuredDir);
  }

  private buildAssetPublicUrl(assetId: string): string {
    const appConfig = this.configService.get<AppConfig>('app');
    const backendUrl = (appConfig?.backendUrl || 'http://localhost:3004').replace(/\/+$/, '');
    return `${backendUrl}/api/assets/${assetId}/content`;
  }

  private extensionForMimeType(mimeType: string): string {
    switch (mimeType) {
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      case 'video/mp4':
        return '.mp4';
      case 'video/quicktime':
        return '.mov';
      case 'video/webm':
        return '.webm';
      default:
        return '.jpg';
    }
  }

  private toDto(asset: Asset): AssetDto {
    return {
      id: asset.id,
      storeId: asset.storeId,
      uploadedByUserId: asset.uploadedByUserId,
      type: asset.type,
      mimeType: asset.mimeType,
      size: Number(asset.size),
      width: asset.width,
      height: asset.height,
      storageUrl: asset.storageUrl,
      metaImageHash: asset.metaImageHash,
      status: asset.status,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  private readImageDimensions(buffer: Buffer, mimeType: string): ImageDimensions {
    if (mimeType === 'image/png') {
      return this.readPngDimensions(buffer);
    }

    if (mimeType === 'image/webp') {
      return this.readWebpDimensions(buffer);
    }

    return this.readJpegDimensions(buffer);
  }

  private readPngDimensions(buffer: Buffer): ImageDimensions {
    const pngSignature = '89504e470d0a1a0a';
    if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== pngSignature) {
      throw new BadRequestException('Formato inválido');
    }

    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  private readJpegDimensions(buffer: Buffer): ImageDimensions {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
      throw new BadRequestException('Formato inválido');
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

    throw new BadRequestException('Formato inválido');
  }

  private readWebpDimensions(buffer: Buffer): ImageDimensions {
    if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
      throw new BadRequestException('Formato inválido');
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

    throw new BadRequestException('Formato inválido');
  }
}
