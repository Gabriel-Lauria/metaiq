import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { InsightsService } from './insights.service';
import { Insight } from './insight.entity';

@Controller('insights')
@UseGuards(JwtAuthGuard)
export class InsightsController {
  private readonly logger = new Logger(InsightsController.name);

  constructor(private readonly insightsService: InsightsService) {}

  /**
   * GET /insights
   * Retorna lista de insights com filtros opcionais
   */
  @Get()
  async findAll(
    @Query('campaignId') campaignId?: string,
    @Query('type') type?: string,
    @Query('severity') severity?: string,
    @Query('resolved') resolved?: string,
  ): Promise<Insight[]> {
    return this.insightsService.findAll({
      campaignId,
      type,
      severity,
      resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
    });
  }

  /**
   * GET /insights/:id
   * Retorna um insight específico
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Insight> {
    return this.insightsService.findOne(id);
  }

  /**
   * PATCH /insights/:id/resolve
   * Marca um insight como resolvido
   */
  @Patch(':id/resolve')
  async resolve(@Param('id') id: string): Promise<Insight> {
    this.logger.log(`Insight ${id} marcado como resolvido`);
    return this.insightsService.resolveInsight(id);
  }
}
