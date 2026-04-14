import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from './campaign.entity';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';

export interface CreateCampaignDto {
  metaId: string;
  name: string;
  status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  objective?: 'CONVERSIONS' | 'REACH' | 'TRAFFIC' | 'LEADS';
  dailyBudget: number;
  startTime: Date;
  endTime?: Date;
  userId: string;
  adAccountId: string;
}

export interface UpdateCampaignDto {
  name?: string;
  status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  objective?: string;
  dailyBudget?: number;
  endTime?: Date;
}

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private campaignRepository: Repository<Campaign>,
  ) {}

  async findAll(): Promise<Campaign[]> {
    return this.campaignRepository.find({
      relations: ['adAccount'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Retorna apenas campanhas ativas de um usuário
   * Usado pelo cron de insights
   */
  async findAllActive(): Promise<Campaign[]> {
    return this.campaignRepository.find({
      where: { status: 'ACTIVE' },
      relations: ['adAccount'],
      order: { createdAt: 'DESC' },
    });
  }

  async findAllPaginated(
    pagination: PaginationDto,
  ): Promise<PaginatedResponse<Campaign>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await this.campaignRepository.findAndCount({
      relations: ['adAccount'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async findOne(id: string): Promise<Campaign> {
    const campaign = await this.campaignRepository.findOne({
      where: { id },
      relations: ['adAccount'],
    });

    if (!campaign) {
      throw new NotFoundException(`Campanha ${id} não encontrada`);
    }

    return campaign;
  }

  /**
   * Cria uma nova campanha
   */
  async create(dto: CreateCampaignDto): Promise<Campaign> {
    // Validação básica
    if (!dto.name || !dto.dailyBudget || !dto.adAccountId) {
      throw new BadRequestException(
        'Campos obrigatórios: name, dailyBudget, adAccountId',
      );
    }

    if (dto.dailyBudget <= 0) {
      throw new BadRequestException('Daily budget deve ser maior que zero');
    }

    const campaign = this.campaignRepository.create({
      ...dto,
      status: dto.status || 'ACTIVE',
      score: 0,
    });

    return this.campaignRepository.save(campaign);
  }

  /**
   * Atualiza dados da campanha
   */
  async update(id: string, dto: UpdateCampaignDto): Promise<Campaign> {
    const campaign = await this.findOne(id);

    if (dto.dailyBudget !== undefined && dto.dailyBudget <= 0) {
      throw new BadRequestException('Daily budget deve ser maior que zero');
    }

    Object.assign(campaign, dto);
    return this.campaignRepository.save(campaign);
  }

  /**
   * Delete (soft delete — muda status para ARCHIVED)
   */
  async remove(id: string): Promise<void> {
    const campaign = await this.findOne(id);
    campaign.status = 'ARCHIVED';
    await this.campaignRepository.save(campaign);
  }

  /**
   * Busca campanhas por usuário
   */
  async findByUser(userId: string): Promise<Campaign[]> {
    return this.campaignRepository.find({
      where: { userId },
      relations: ['adAccount'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Busca campanhas por conta de anúncios
   */
  async findByAdAccount(adAccountId: string): Promise<Campaign[]> {
    return this.campaignRepository.find({
      where: { adAccountId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Atualiza score da campanha baseado em métricas
   */
  async updateScore(id: string, score: number): Promise<Campaign> {
    const campaign = await this.findOne(id);
    campaign.score = Math.max(0, Math.min(100, score)); // Normalizarpara 0-100
    return this.campaignRepository.save(campaign);
  }
}