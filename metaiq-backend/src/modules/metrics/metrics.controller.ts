import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { MetricsService } from './metrics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { MetricDaily } from './metric-daily.entity';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';

class MetricsQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  campaignId?: string;
}

@Controller('metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query() query: MetricsQueryDto,
  ): Promise<PaginatedResponse<MetricDaily>> {
    if (query.campaignId) {
      return this.metricsService.findByCampaignPaginated(req.user, query.campaignId, query);
    }
    return this.metricsService.findAllPaginated(req.user, query);
  }

  @Get('summary')
  async getSummary(
    @Request() req: AuthenticatedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();
    return this.metricsService.getSummary(req.user, fromDate, toDate);
  }

  @Get('campaigns/:campaignId')
  async findByCampaign(
    @Request() req: AuthenticatedRequest,
    @Param('campaignId') campaignId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<MetricDaily[]> {
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    return this.metricsService.findByCampaignForUser(req.user, campaignId, fromDate, toDate);
  }

  @Get('campaigns/:campaignId/aggregate')
  async getCampaignAggregate(
    @Request() req: AuthenticatedRequest,
    @Param('campaignId') campaignId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    return this.metricsService.getCampaignSummaryForUser(req.user, campaignId, fromDate, toDate);
  }
}
