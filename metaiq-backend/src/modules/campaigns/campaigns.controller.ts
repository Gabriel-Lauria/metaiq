import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { Campaign } from './campaign.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';

class CampaignQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;
}

@Controller('campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CampaignQueryDto,
  ): Promise<PaginatedResponse<Campaign>> {
    return this.campaignsService.findAllPaginated(user, query, { storeId: query.storeId });
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.findOne(id, user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
  async create(
    @Body() dto: CreateCampaignDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Campaign> {
    return this.campaignsService.create(dto, user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Campaign> {
    return this.campaignsService.update(id, user, dto);
  }
}
