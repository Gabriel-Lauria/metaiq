import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { MetricsService } from './metrics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { MetricDaily } from './metric-daily.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class MetricsQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  campaignId?: string;
}

@Controller('metrics')
@UseGuards(JwtAuthGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  async findAll(
    @CurrentUser() userId: string,
    @Query() query: MetricsQueryDto,
  ): Promise<PaginatedResponse<MetricDaily>> {
    if (query.campaignId) {
      return this.metricsService.findByCampaignPaginated(userId, query.campaignId, query);
    }
    return this.metricsService.findAllPaginated(userId, query);
  }

  @Get('summary')
  async getSummary(
    @CurrentUser() userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();
    return this.metricsService.getSummary(userId, fromDate, toDate);
  }

  @Get('campaigns/:campaignId')
  async findByCampaign(
    @CurrentUser() userId: string,
    @Param('campaignId') campaignId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<MetricDaily[]> {
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    return this.metricsService.findByCampaignForUser(userId, campaignId, fromDate, toDate);
  }

  @Get('campaigns/:campaignId/aggregate')
  async getCampaignAggregate(
    @CurrentUser() userId: string,
    @Param('campaignId') campaignId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    return this.metricsService.getCampaignSummaryForUser(userId, campaignId, fromDate, toDate);
  }
}
