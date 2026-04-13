import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();
    return this.metricsService.getSummary(fromDate, toDate);
  }
}