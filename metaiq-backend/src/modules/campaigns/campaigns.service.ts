import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Campaign } from './campaign.entity';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private campaignRepository: Repository<Campaign>,
  ) {}

  async findAll(userId: string): Promise<Campaign[]> {
    return this.campaignRepository.find({
      where: this.buildOwnershipWhere(userId),
      relations: ['adAccount', 'store'],
      order: { createdAt: 'DESC' },
    });
  }

  async findAllPaginated(userId: string, pagination: PaginationDto): Promise<PaginatedResponse<Campaign>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await this.campaignRepository.findAndCount({
      where: this.buildOwnershipWhere(userId),
      relations: ['adAccount', 'store'],
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

  async findOne(id: string, userId: string): Promise<Campaign> {
    const campaign = await this.campaignRepository.findOne({
      where: this.buildOwnershipWhere(userId, { id }),
      relations: ['adAccount', 'store'],
    });

    if (!campaign) {
      throw new NotFoundException(`Campanha ${id} não encontrada`);
    }

    return campaign;
  }

  async findAllActive(): Promise<Campaign[]> {
    return this.campaignRepository.find({
      where: { status: 'ACTIVE' },
      relations: ['adAccount', 'store'],
      order: { createdAt: 'DESC' },
    });
  }

  private buildOwnershipWhere(
    userId: string,
    extra: Partial<Pick<Campaign, 'id'>> = {},
  ): FindOptionsWhere<Campaign>[] {
    return [
      { ...extra, userId },
      { ...extra, store: { userStores: { userId } } },
    ];
  }
}
