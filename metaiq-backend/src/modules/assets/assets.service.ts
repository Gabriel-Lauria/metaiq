import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
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
  adAccountId: string | null;
  type: AssetType;
  originalName: string | null;
  fileName: string | null;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  storageUrl: string;
  metaImageHash: string | null;
  metaRawImageId: string | null;
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
  private readonly signedUrlTtlMs = 10 * 60 * 1000;

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
    const saved = await this.createAssetForUser(user, storeId, file);
    return this.toDto(saved);
  }

  async createAssetForUser(
    user: AuthenticatedUser,
    storeId: string,
    file: UploadedFile | undefined,
  ): Promise<Asset> {
    await this.accessScope.validateStoreAccess(user, storeId);

    if (!file) {
      throw new BadRequestException('Arquivo é obrigatório');
    }

    const mimeType = String(file.mimetype || '').trim().toLowerCase();
    const assetType = this.resolveAssetType(mimeType);
    const originalName = this.normalizeOriginalName(file.originalname);
    const normalizedFileName = this.buildNormalizedFileName(originalName, mimeType);
    const asset = this.assetRepository.create({
      storeId,
      uploadedByUserId: user.id,
      adAccountId: null,
      type: assetType,
      originalName,
      fileName: normalizedFileName,
      mimeType,
      size: Number(file.size || 0),
      width: null,
      height: null,
      storageUrl: '',
      metaImageHash: null,
      metaRawImageId: null,
      metaRawResponse: null,
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
    const storageUrl = this.buildAssetContentUrl(saved.id);
    saved.storageUrl = storageUrl;
    await this.persistFile(saved, file.buffer);
    return this.assetRepository.save(saved);
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

    asset.storageUrl = this.buildSignedAssetUrl(asset);
    return asset;
  }

  async getAssetForStoreForUser(
    user: AuthenticatedUser,
    storeId: string,
    assetId: string,
  ): Promise<Asset> {
    await this.accessScope.validateAssetAccess(user, storeId, assetId);
    return this.getAssetForStore(storeId, assetId);
  }

  async findImageAssetByMetaHash(
    storeId: string,
    metaImageHash: string,
    adAccountId?: string | null,
  ): Promise<Asset | null> {
    const normalizedHash = String(metaImageHash || '').trim();
    if (!normalizedHash) {
      return null;
    }

    const where = adAccountId
      ? { storeId, metaImageHash: normalizedHash, adAccountId, type: 'image' as const }
      : { storeId, metaImageHash: normalizedHash, type: 'image' as const };

    const asset = await this.assetRepository.findOne({ where });
    if (!asset || asset.status === 'REJECTED' || asset.status === 'FAILED') {
      return null;
    }

    asset.storageUrl = this.buildSignedAssetUrl(asset);
    return asset;
  }

  async attachMetaImageData(
    assetId: string,
    meta: {
      adAccountId: string;
      metaImageHash: string;
      metaRawImageId?: string | null;
      metaRawResponse?: Record<string, unknown> | null;
      status?: Asset['status'];
    },
  ): Promise<Asset> {
    const asset = await this.assetRepository.findOne({ where: { id: assetId } });
    if (!asset) {
      throw new NotFoundException('Asset não encontrado');
    }

    asset.adAccountId = meta.adAccountId;
    asset.metaImageHash = meta.metaImageHash;
    asset.metaRawImageId = meta.metaRawImageId ?? null;
    asset.metaRawResponse = meta.metaRawResponse ?? null;
    asset.status = meta.status ?? 'SENT_TO_META';

    const saved = await this.assetRepository.save(asset);
    saved.storageUrl = this.buildSignedAssetUrl(saved);
    return saved;
  }

  async softDeleteAsset(assetId: string): Promise<Asset> {
    const asset = await this.assetRepository.findOne({ where: { id: assetId } });
    if (!asset) {
      throw new NotFoundException('Asset não encontrado');
    }

    asset.deletedAt = new Date();
    return this.assetRepository.save(asset);
  }

  async archiveAsset(assetId: string): Promise<Asset> {
    const asset = await this.assetRepository.findOne({ where: { id: assetId } });
    if (!asset) {
      throw new NotFoundException('Asset não encontrado');
    }

    asset.archivedAt = new Date();
    return this.assetRepository.save(asset);
  }

  async getAssetWithSoftDeleteCheck(storeId: string, assetId: string): Promise<Asset> {
    const asset = await this.assetRepository.findOne({
      where: { id: assetId, storeId },
    });

    if (!asset) {
      throw new BadRequestException('Asset não pertence à store selecionada');
    }

    if (asset.deletedAt || asset.archivedAt) {
      throw new BadRequestException('Asset foi removido ou arquivado');
    }

    if (asset.status === 'REJECTED' || asset.status === 'FAILED') {
      throw new BadRequestException('Asset não está disponível para uso');
    }

    return asset;
  }

  async getAssetWithSoftDeleteCheckForUser(
    user: AuthenticatedUser,
    storeId: string,
    assetId: string,
  ): Promise<Asset> {
    await this.accessScope.validateAssetAccess(user, storeId, assetId);
    return this.getAssetWithSoftDeleteCheck(storeId, assetId);
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

  async getAssetFileStreamFromSignedUrl(
    assetId: string,
    expires: string | undefined,
    signature: string | undefined,
  ): Promise<{
    asset: Asset;
    filePath: string;
  }> {
    const asset = await this.assetRepository.findOne({ where: { id: assetId } });
    if (!asset) {
      throw new NotFoundException('Asset não encontrado');
    }

    this.assertValidAssetSignature(asset, expires, signature);

    if (asset.status === 'REJECTED' || asset.status === 'FAILED') {
      throw new BadRequestException('Asset não está disponível para uso');
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

  private buildAssetContentUrl(assetId: string): string {
    const appConfig = this.configService.get<AppConfig>('app');
    const backendUrl = (appConfig?.backendUrl || 'http://localhost:3004').replace(/\/+$/, '');
    return `${backendUrl}/api/assets/${assetId}/content`;
  }

  private buildSignedAssetUrl(asset: Asset): string {
    const expiresAt = Date.now() + this.signedUrlTtlMs;
    const expires = String(expiresAt);
    const signature = this.createAssetSignature(asset, expires);
    return `${this.buildAssetContentUrl(asset.id)}?expires=${encodeURIComponent(expires)}&signature=${encodeURIComponent(signature)}`;
  }

  private createAssetSignature(asset: Asset, expires: string): string {
    const appConfig = this.configService.get<AppConfig>('app');
    const secret = appConfig?.cryptoSecret;
    if (!secret) {
      throw new UnauthorizedException('Assinatura de asset indisponível');
    }

    return createHmac('sha256', secret)
      .update(`${asset.id}:${asset.storeId}:${expires}`)
      .digest('hex');
  }

  private assertValidAssetSignature(asset: Asset, expires: string | undefined, signature: string | undefined): void {
    if (!expires || !signature) {
      throw new UnauthorizedException('Link do asset inválido ou expirado');
    }

    const expirationTimestamp = Number(expires);
    if (!Number.isFinite(expirationTimestamp) || expirationTimestamp <= Date.now()) {
      throw new UnauthorizedException('Link do asset expirado');
    }

    const expectedSignature = this.createAssetSignature(asset, expires);
    const providedBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (
      providedBuffer.length !== expectedBuffer.length
      || !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Link do asset inválido ou expirado');
    }
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
      adAccountId: asset.adAccountId,
      type: asset.type,
      originalName: asset.originalName,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      size: Number(asset.size),
      width: asset.width,
      height: asset.height,
      storageUrl: this.buildSignedAssetUrl(asset),
      metaImageHash: asset.metaImageHash,
      metaRawImageId: asset.metaRawImageId,
      status: asset.status,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  private normalizeOriginalName(value: string): string {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      return 'image';
    }

    return trimmed
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'image';
  }

  private buildNormalizedFileName(originalName: string, mimeType: string): string {
    const baseName = originalName.replace(/\.[a-z0-9]+$/i, '').slice(0, 100) || 'image';
    return `${baseName}${this.extensionForMimeType(mimeType)}`;
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
