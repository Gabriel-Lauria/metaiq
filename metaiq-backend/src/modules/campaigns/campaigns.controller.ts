import { Controller, Get, Query, UseGuards, Param } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { Campaign } from './campaign.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
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