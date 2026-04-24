import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { IsOptional, IsUUID } from 'class-validator';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OwnershipGuard } from '../../common/guards/ownership.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CheckOwnership } from '../../common/decorators/check-ownership.decorator';
import { Role } from '../../common/enums';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { Campaign } from './campaign.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';
import { AuditService } from '../../common/services/audit.service';

class CampaignQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;
}

@Controller('campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CampaignQueryDto,
  ): Promise<PaginatedResponse<Campaign>> {
    return this.campaignsService.findAllPaginatedForUser(user, query, { storeId: query.storeId });
  }

  @Get(':id')
  @CheckOwnership('campaign', 'id')
  @UseGuards(OwnershipGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.findOneForUser(user, id);
  }

  @Post()
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  async create(
    @Body() dto: CreateCampaignDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<Campaign> {
    const campaign = await this.campaignsService.createForUser(user, dto);
    this.auditService.record({
      action: 'campaign.create',
      status: 'success',
      actorId: user.id,
      actorRole: user.role,
      tenantId: user.tenantId,
      targetType: 'campaign',
      targetId: campaign.id,
      requestId: req.requestId,
      metadata: {
        storeId: campaign.storeId,
        adAccountId: campaign.adAccountId,
      },
    });
    return campaign;
  }

  @Patch(':id')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
  @CheckOwnership('campaign', 'id')
  @UseGuards(OwnershipGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<Campaign> {
    const campaign = await this.campaignsService.updateForUser(user, id, dto);
    this.auditService.record({
      action: 'campaign.update',
      status: 'success',
      actorId: user.id,
      actorRole: user.role,
      tenantId: user.tenantId,
      targetType: 'campaign',
      targetId: campaign.id,
      requestId: req.requestId,
      metadata: {
        storeId: campaign.storeId,
        adAccountId: campaign.adAccountId,
        changedFields: Object.keys(dto),
      },
    });
    return campaign;
  }
}
