import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../../common/interfaces';
import { Role } from '../../../common/enums';
import { MetaIntegrationService } from './meta.service';
import { MetaSyncService } from './meta-sync.service';
import { MetaCampaignCreation, MetaCampaignCreationStatus } from './meta-campaign-creation.entity';
import {
  ConnectMetaIntegrationDto,
  CreateMetaCampaignDto,
  CreateMetaCampaignResponseDto,
  MetaAdAccountDto,
  MetaCampaignDto,
  MetaOAuthStartResponseDto,
  MetaPageDto,
  MetaSyncPlan,
  StoreIntegrationStatusDto,
  UpdateMetaPageDto,
  UpdateMetaIntegrationStatusDto,
} from './dto/meta-integration.dto';

@Controller('integrations/meta/stores/:storeId')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MetaIntegrationController {
  constructor(
    private readonly metaIntegrationService: MetaIntegrationService,
    private readonly metaSyncService: MetaSyncService,
  ) {}

  @Get('status')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
  getStatus(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StoreIntegrationStatusDto> {
    return this.metaIntegrationService.getStatus(storeId, user);
  }

  @Get('oauth/start')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  startOAuth(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MetaOAuthStartResponseDto> {
    return this.metaIntegrationService.startOAuth(storeId, user);
  }

  @Get('sync-plan')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  getSyncPlan(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MetaSyncPlan> {
    return this.metaIntegrationService.buildSyncPlan(storeId, user);
  }

  @Get('pages')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  getPages(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MetaPageDto[]> {
    return this.metaIntegrationService.fetchPagesForStore(storeId, user);
  }

  @Patch('page')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  updatePage(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMetaPageDto,
  ): Promise<StoreIntegrationStatusDto> {
    return this.metaIntegrationService.updatePage(storeId, user, dto);
  }

  @Get('ad-accounts')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  getAdAccounts(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MetaAdAccountDto[]> {
    return this.metaSyncService.fetchAdAccounts(storeId, user);
  }

  @Post('ad-accounts/sync')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  syncAdAccounts(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<MetaAdAccountDto[]> {
    return this.metaSyncService.syncAdAccounts(storeId, user, req.requestId);
  }

  @Get('ad-accounts/:adAccountId/campaigns')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  getCampaigns(
    @Param('storeId') storeId: string,
    @Param('adAccountId') adAccountId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MetaCampaignDto[]> {
    return this.metaSyncService.fetchCampaigns(storeId, adAccountId, user);
  }

  @Post('ad-accounts/:adAccountId/campaigns/sync')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  syncCampaigns(
    @Param('storeId') storeId: string,
    @Param('adAccountId') adAccountId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<MetaCampaignDto[]> {
    return this.metaSyncService.syncCampaigns(storeId, adAccountId, user, req.requestId);
  }

  @Post('campaigns')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  createCampaign(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMetaCampaignDto,
    @Req() req: Request,
  ): Promise<CreateMetaCampaignResponseDto> {
    return this.metaIntegrationService.createCampaign(storeId, user, dto, req.requestId);
  }

  @Post('connect')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  connect(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConnectMetaIntegrationDto,
  ): Promise<StoreIntegrationStatusDto> {
    return this.metaIntegrationService.connect(storeId, user, dto);
  }

  @Patch('status')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  updateStatus(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMetaIntegrationStatusDto,
  ): Promise<StoreIntegrationStatusDto> {
    return this.metaIntegrationService.updateStatus(storeId, user, dto);
  }

  @Delete()
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  disconnect(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StoreIntegrationStatusDto> {
    return this.metaIntegrationService.disconnect(storeId, user);
  }
}

@Controller('internal/meta/campaign-creations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MetaCampaignCreationAuditController {
  constructor(private readonly metaIntegrationService: MetaIntegrationService) {}

  @Get()
  @Roles(Role.PLATFORM_ADMIN)
  list(
    @Query('storeId') storeId?: string,
    @Query('status') status?: MetaCampaignCreationStatus,
    @Query('limit') limit?: string,
  ): Promise<MetaCampaignCreation[]> {
    return this.metaIntegrationService.listCampaignCreations({
      storeId,
      status,
      limit: limit ? Number(limit) : undefined,
    });
  }
}

@Controller('integrations/meta/oauth')
export class MetaOAuthCallbackController {
  constructor(private readonly metaIntegrationService: MetaIntegrationService) {}

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_reason') errorReason: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.metaIntegrationService.handleOAuthCallback({
      code,
      state,
      error,
      error_reason: errorReason,
      error_description: errorDescription,
    });
    res.redirect(result.redirectUrl);
  }
}
