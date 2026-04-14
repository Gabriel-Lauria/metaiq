import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { InsightsService } from './insights.service';
import { Insight } from './insight.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('insights')
@UseGuards(JwtAuthGuard)
export class InsightsController {
  private readonly logger = new Logger(InsightsController.name);

  constructor(private readonly insightsService: InsightsService) {}

  /**
   * GET /insights
   * Retorna lista de insights com filtros opcionais
   * VALIDAÇÃO: apenas insights de campanhas do usuário autenticado
   */
  @Get()
  async findAll(
    @CurrentUser() userId: string,
    @Query('campaignId') campaignId?: string,
    @Query('type') type?: string,
    @Query('severity') severity?: string,
    @Query('resolved') resolved?: string,
  ): Promise<Insight[]> {
    return this.insightsService.findAllByUser(userId, {
      campaignId,
      type,
      severity,
      resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
    });
  }

  /**
   * GET /insights/:id
   * Retorna um insight específico
   * VALIDAÇÃO: apenas se a campanha pertence ao usuário
   */
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ): Promise<Insight> {
    return this.insightsService.findOneByUser(id, userId);
  }

  /**
   * PATCH /insights/:id/resolve
   * Marca um insight como resolvido
   * VALIDAÇÃO: apenas se a campanha pertence ao usuário
   */
  @Patch(':id/resolve')
  async resolve(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ): Promise<Insight> {
    this.logger.log(`Insight ${id} marcado como resolvido por usuário ${userId}`);
    return this.insightsService.resolveInsightByUser(id, userId);
  }
}
