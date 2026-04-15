import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { MetricsService } from './metrics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { MetricDaily } from './metric-daily.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces';

class MetricsQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;
}

@Controller('metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MetricsQueryDto,
  ): Promise<PaginatedResponse<MetricDaily>> {
    if (query.campaignId) {
      return this.metricsService.findByCampaignPaginated(user, query.campaignId, query);
    }
    return this.metricsService.findAllPaginated(user, query, { storeId: query.storeId });
  }

  @Get('summary')
  async getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('storeId') storeId?: string,
  ) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();
    return this.metricsService.getSummary(user, fromDate, toDate, storeId);
  }

  @Get('campaigns/:campaignId')
  async findByCampaign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId') campaignId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<MetricDaily[]> {
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    return this.metricsService.findByCampaignForUser(user, campaignId, fromDate, toDate);
  }

  @Get('campaigns/:campaignId/aggregate')
  async getCampaignAggregate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId') campaignId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    return this.metricsService.getCampaignSummaryForUser(user, campaignId, fromDate, toDate);
  }
}
