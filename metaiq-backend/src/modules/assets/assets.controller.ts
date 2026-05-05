import { Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AssetsService, AssetDto } from './assets.service';
import { AssetType } from './entities/asset.entity';

@Controller('assets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post('upload')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: { buffer: Buffer; size: number; mimetype: string; originalname: string } | undefined,
    @Body('storeId') bodyStoreId?: string,
    @Query('storeId') storeId?: string,
  ): Promise<AssetDto> {
    return this.assetsService.uploadForUser(user, storeId || bodyStoreId || '', file);
  }

  @Get()
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('storeId') storeId?: string,
    @Query('type') type?: AssetType,
  ): Promise<AssetDto[]> {
    return this.assetsService.listForUser(user, storeId || '', type);
  }

}

@Controller('assets')
export class AssetContentController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get(':assetId/content')
  async content(
    @Param('assetId') assetId: string,
    @Query('expires') expires: string | undefined,
    @Query('signature') signature: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { asset, filePath } = await this.assetsService.getAssetFileStreamFromSignedUrl(assetId, expires, signature);
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Content-Length', String(asset.size));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename="${asset.id}"`);
    createReadStream(filePath).pipe(res);
  }
}
