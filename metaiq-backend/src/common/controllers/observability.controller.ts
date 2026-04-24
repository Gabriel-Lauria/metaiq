import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../enums';
import { MetricsService } from '../services/metrics.service';

@Controller('observability')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PLATFORM_ADMIN)
export class ObservabilityController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics')
  metrics() {
    return {
      status: 'ok',
      metrics: this.metricsService.getAllMetrics(),
      timestamp: new Date().toISOString(),
    };
  }
}
