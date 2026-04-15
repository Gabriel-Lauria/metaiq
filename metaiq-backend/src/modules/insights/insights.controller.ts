import {
  Controller,
  Get,
  Logger,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { InsightsService } from './insights.service';
import { Insight } from './insight.entity';

@Controller('insights')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)
export class InsightsController {
  private readonly logger = new Logger(InsightsController.name);

  constructor(private readonly insightsService: InsightsService) {}

  @Get()
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query('campaignId') campaignId?: string,
    @Query('type') type?: string,
    @Query('severity') severity?: string,
    @Query('resolved') resolved?: string,
  ): Promise<Insight[]> {
    return this.insightsService.findAllByUser(req.user, {
      campaignId,
      type,
      severity,
      resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
    });
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<Insight> {
    return this.insightsService.findOneByUser(id, req.user);
  }

  @Patch(':id/resolve')
  @Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
  async resolve(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<Insight> {
    this.logger.log(`Insight ${id} marcado como resolvido por usuario ${req.user.id}`);
    return this.insightsService.resolveInsightByUser(id, req.user);
  }
}
