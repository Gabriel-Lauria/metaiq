import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { MetricDaily } from './metric-daily.entity';

@Controller('metrics')
@UseGuards(JwtAuthGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  async findAll(@Query() pagination: PaginationDto, @Query('campaignId') campaignId?: string): Promise<PaginatedResponse<MetricDaily>> {
    if (campaignId) {
      return this.metricsService.findByCampaignPaginated(campaignId, pagination);
    }
    return this.metricsService.findAllPaginated(pagination);
  }

  @Get('summary')
  async getSummary(@Query('from') from?: string, @Query('to') to?: string) {
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    return this.metricsService.getSummary(fromDate, toDate);
  }

  @Get('campaigns/:campaignId')
  async getCampaignMetrics(
    @Param('campaignId') campaignId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    if (page || limit) {
      return this.metricsService.findByCampaignPaginated(campaignId, { page, limit });
    }

    return this.metricsService.findByCampaign(campaignId);
  }

  @Get('campaigns/:campaignId/aggregate')
  async getCampaignAggregate(
    @Param('campaignId') campaignId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    return this.metricsService.getCampaignSummary(campaignId, fromDate, toDate);
  }
}