import { Controller, Get, Query, UseGuards, Param } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { Campaign } from './campaign.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  async findAll(
    @CurrentUser() userId: string,
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResponse<Campaign>> {
    return this.campaignsService.findAllPaginated(userId, pagination);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ) {
    return this.campaignsService.findOne(id, userId);
  }
}
