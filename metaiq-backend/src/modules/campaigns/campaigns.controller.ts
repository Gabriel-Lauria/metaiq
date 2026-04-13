import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Param,
  Body,
  UseGuards,
  Request,
  Logger,
} from '@nestjs/common';
import { CampaignsService, CreateCampaignDto, UpdateCampaignDto } from './campaigns.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { Campaign } from './campaign.entity';

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  private readonly logger = new Logger(CampaignsController.name);

  constructor(private readonly campaignsService: CampaignsService) {}

  /**
   * GET /campaigns
   * Lista campanhas do usuário com paginação
   */
  @Get()
  async findAll(
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResponse<Campaign>> {
    return this.campaignsService.findAllPaginated(pagination);
  }

  /**
   * GET /campaigns/user/:userId
   * Lista campanhas de um usuário específico
   */
  @Get('user/:userId')
  async findByUser(@Param('userId') userId: string): Promise<Campaign[]> {
    return this.campaignsService.findByUser(userId);
  }

  /**
   * GET /campaigns/ad-account/:adAccountId
   * Lista campanhas de uma conta de anúncios
   */
  @Get('ad-account/:adAccountId')
  async findByAdAccount(
    @Param('adAccountId') adAccountId: string,
  ): Promise<Campaign[]> {
    return this.campaignsService.findByAdAccount(adAccountId);
  }

  /**
   * GET /campaigns/:id
   * Retorna uma campanha específica
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Campaign> {
    return this.campaignsService.findOne(id);
  }

  /**
   * POST /campaigns
   * Cria uma nova campanha
   */
  @Post()
  async create(
    @Body() dto: CreateCampaignDto,
    @Request() req: any,
  ): Promise<Campaign> {
    dto.userId = req.user.sub; // Garante que pertence ao usuário
    this.logger.log(`Nova campanha criada: ${dto.name} pelo usuário ${req.user.email}`);
    return this.campaignsService.create(dto);
  }

  /**
   * PATCH /campaigns/:id
   * Atualiza dados da campanha
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ): Promise<Campaign> {
    this.logger.log(`Campanha atualizada: ${id}`);
    return this.campaignsService.update(id, dto);
  }

  /**
   * DELETE /campaigns/:id
   * Deleta (arquiva) uma campanha
   */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    await this.campaignsService.remove(id);
    this.logger.log(`Campanha arquivada: ${id}`);
    return { message: 'Campanha arquivada' };
  }
}