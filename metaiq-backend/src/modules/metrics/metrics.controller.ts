import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { MetricsService } from './metrics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OwnershipGuard } from '../../common/guards/ownership.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CheckOwnership } from '../../common/decorators/check-ownership.decorator';
import { Role } from '../../common/enums';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { MetricDaily } from './metric-daily.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces';

class MetricsQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;
}

class DateRangeQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

class MetricsSummaryQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;
}

@Controller('metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MetricsQueryDto,
  ): Promise<PaginatedResponse<MetricDaily>> {
    if (query.campaignId) {
      return this.metricsService.findByCampaignPaginatedForUser(user, query.campaignId, query);
    }
    return this.metricsService.findAllPaginatedForUser(user, query, { storeId: query.storeId });
  }

  @Get('summary')
  async getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MetricsSummaryQueryDto,
  ) {
    const { fromDate, toDate } = this.resolveDateRange(query);
    return this.metricsService.getSummaryForUser(user, fromDate, toDate, query.storeId);
  }

  @Get('campaigns/:campaignId')
  @CheckOwnership('metricCampaign', 'campaignId')
  @UseGuards(OwnershipGuard)
  async findByCampaign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Query() query: DateRangeQueryDto,
  ): Promise<MetricDaily[]> {
    const { from, to } = this.resolveDateRange(query);
    return this.metricsService.findByCampaignForUser(user, campaignId, from, to);
  }

  @Get('campaigns/:campaignId/aggregate')
  @CheckOwnership('metricCampaign', 'campaignId')
  @UseGuards(OwnershipGuard)
  async getCampaignAggregate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Query() query: DateRangeQueryDto,
  ) {
    const { from, to } = this.resolveDateRange(query);
    return this.metricsService.getCampaignSummaryForUser(user, campaignId, from, to);
  }

  private resolveDateRange(query: DateRangeQueryDto): {
    from: string;
    to: string;
    fromDate: Date;
    toDate: Date;
  } {
    const from = query.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = query.to || new Date().toISOString().split('T')[0];
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (fromDate > toDate) {
      throw new BadRequestException('from não pode ser posterior a to');
    }

    return { from, to, fromDate, toDate };
  }
}
