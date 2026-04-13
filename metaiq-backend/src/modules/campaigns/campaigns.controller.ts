import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { Campaign } from './campaign.entity';

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  async findAll(@Query() pagination: PaginationDto): Promise<PaginatedResponse<Campaign>> {
    return this.campaignsService.findAllPaginated(pagination);
  }

  @Get(':id')
  async findOne(id: string) {
    return this.campaignsService.findOne(id);
  }
}