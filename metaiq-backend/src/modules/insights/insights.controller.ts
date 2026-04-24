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
import { OwnershipGuard } from '../../common/guards/ownership.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CheckOwnership } from '../../common/decorators/check-ownership.decorator';
import { Role } from '../../common/enums';
import { InsightsService } from './insights.service';
import { Insight } from './insight.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces';

@Controller('insights')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InsightsController {
  private readonly logger = new Logger(InsightsController.name);

  constructor(private readonly insightsService: InsightsService) {}

  /**
   * GET /insights
   * Retorna lista de insights com filtros opcionais
   * VALIDAÇÃO: apenas insights de campanhas do usuário autenticado
   */
  @Get()
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('campaignId') campaignId?: string,
    @Query('type') type?: string,
    @Query('severity') severity?: string,
    @Query('resolved') resolved?: string,
    @Query('storeId') storeId?: string,
  ): Promise<Insight[]> {
    return this.insightsService.findAllForUser(user, {
      campaignId,
      storeId,
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
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)
  @CheckOwnership('insight', 'id')
  @UseGuards(OwnershipGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Insight> {
    return this.insightsService.findOneForUser(user, id);
  }

  /**
   * PATCH /insights/:id/resolve
   * Marca um insight como resolvido
   * VALIDAÇÃO: apenas se a campanha pertence ao usuário
   */
  @Patch(':id/resolve')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
  @CheckOwnership('insight', 'id')
  @UseGuards(OwnershipGuard)
  async resolve(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Insight> {
    this.logger.log(`Insight ${id} marcado como resolvido por usuário ${user.id}`);
    return this.insightsService.resolveForUser(user, id);
  }
}
