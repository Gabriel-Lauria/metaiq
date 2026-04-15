import { Controller, Get, Query, UseGuards, Param, Request } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { Campaign } from './campaign.entity';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';

@Controller('campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResponse<Campaign>> {
    return this.campaignsService.findAllPaginated(req.user, pagination);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.campaignsService.findOne(id, req.user);
  }
}
