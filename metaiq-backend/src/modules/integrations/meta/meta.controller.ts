import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../../common/interfaces';
import { Role } from '../../../common/enums';
import { AuditService } from '../../../common/services/audit.service';
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
    private readonly auditService: AuditService,
  ) {}

  @Get('status')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
  getStatus(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StoreIntegrationStatusDto> {
    return this.metaIntegrationService.getStatusForUser(user, storeId);
  }

  @Get('oauth/start')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  startOAuth(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MetaOAuthStartResponseDto> {
    return this.metaIntegrationService.startOAuthForUser(user, storeId);
  }

  @Get('sync-plan')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  getSyncPlan(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MetaSyncPlan> {
    return this.metaIntegrationService.buildSyncPlanForUser(user, storeId);
  }

  @Get('pages')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  getPages(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MetaPageDto[]> {
    return this.metaIntegrationService.fetchPagesForStoreForUser(user, storeId);
  }

  @Patch('page')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  updatePage(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMetaPageDto,
  ): Promise<StoreIntegrationStatusDto> {
    return this.metaIntegrationService.updatePageForUser(user, storeId, dto);
  }

  @Get('ad-accounts')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  getAdAccounts(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MetaAdAccountDto[]> {
    return this.metaSyncService.fetchAdAccountsForUser(user, storeId);
  }

  @Post('ad-accounts/sync')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  async syncAdAccounts(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<MetaAdAccountDto[]> {
    const result = await this.metaSyncService.syncAdAccountsForUser(user, storeId, req.requestId);
    this.audit(user, req, 'meta.ad_accounts.sync', storeId, { count: result.length });
    return result;
  }

  @Get('ad-accounts/:adAccountId/campaigns')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  getCampaigns(
    @Param('storeId') storeId: string,
    @Param('adAccountId') adAccountId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MetaCampaignDto[]> {
    return this.metaSyncService.fetchCampaignsForUser(user, storeId, adAccountId);
  }

  @Post('ad-accounts/:adAccountId/campaigns/sync')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  async syncCampaigns(
    @Param('storeId') storeId: string,
    @Param('adAccountId') adAccountId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<MetaCampaignDto[]> {
    const result = await this.metaSyncService.syncCampaignsForUser(user, storeId, adAccountId, req.requestId);
    this.audit(user, req, 'meta.campaigns.sync', storeId, { adAccountId, count: result.length });
    return result;
  }

  @Post('campaigns')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  async createCampaign(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMetaCampaignDto,
    @Req() req: Request,
  ): Promise<CreateMetaCampaignResponseDto> {
    const result = await this.metaIntegrationService.createCampaignForUser(user, storeId, dto, req.requestId);
    this.audit(user, req, 'meta.campaign.create', result.executionId ?? result.campaignId, {
      storeId,
      adAccountId: result.adAccountId,
      executionId: result.executionId,
      idempotencyKey: result.idempotencyKey,
    });
    return result;
  }

  @Post('connect')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  async connect(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConnectMetaIntegrationDto,
  ): Promise<StoreIntegrationStatusDto> {
    const result = await this.metaIntegrationService.connectForUser(user, storeId, dto);
    this.audit(user, undefined, 'meta.integration.connect', storeId);
    return result;
  }

  @Patch('status')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  async updateStatus(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMetaIntegrationStatusDto,
  ): Promise<StoreIntegrationStatusDto> {
    const result = await this.metaIntegrationService.updateStatusForUser(user, storeId, dto);
    this.audit(user, undefined, 'meta.integration.status_update', storeId, { status: dto.status });
    return result;
  }

  @Delete()
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  async disconnect(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StoreIntegrationStatusDto> {
    const result = await this.metaIntegrationService.disconnectForUser(user, storeId);
    this.audit(user, undefined, 'meta.integration.disconnect', storeId);
    return result;
  }

  private audit(
    user: AuthenticatedUser,
    req: Request | undefined,
    action: string,
    targetId: string | undefined,
    metadata: Record<string, unknown> = {},
  ): void {
    this.auditService.record({
      action,
      status: 'success',
      actorId: user.id,
      actorRole: user.role,
      tenantId: user.tenantId,
      targetType: 'meta',
      targetId: targetId ?? null,
      requestId: req?.requestId,
      metadata,
    });
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
