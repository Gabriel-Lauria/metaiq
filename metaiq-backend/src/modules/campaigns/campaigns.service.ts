import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from './campaign.entity';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AccessScopeService } from '../../common/services/access-scope.service';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private campaignRepository: Repository<Campaign>,
    private readonly accessScope: AccessScopeService,
  ) {}

  async findAll(user: AuthenticatedUser): Promise<Campaign[]> {
    return this.accessScope
      .applyCampaignScope(
        this.campaignRepository
          .createQueryBuilder('campaign')
          .leftJoinAndSelect('campaign.adAccount', 'adAccount')
          .leftJoinAndSelect('campaign.store', 'store')
          .orderBy('campaign.createdAt', 'DESC'),
        user,
      )
      .getMany();
  }

  async findAllPaginated(user: AuthenticatedUser, pagination: PaginationDto): Promise<PaginatedResponse<Campaign>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const query = this.accessScope.applyCampaignScope(
      this.campaignRepository
        .createQueryBuilder('campaign')
        .leftJoinAndSelect('campaign.adAccount', 'adAccount')
        .leftJoinAndSelect('campaign.store', 'store')
        .orderBy('campaign.createdAt', 'DESC')
        .skip(skip)
        .take(limit),
      user,
    );

    const [data, total] = await query.getManyAndCount();

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

  async findOne(id: string, user: AuthenticatedUser): Promise<Campaign> {
    const campaign = await this.accessScope
      .applyCampaignScope(
        this.campaignRepository
          .createQueryBuilder('campaign')
          .leftJoinAndSelect('campaign.adAccount', 'adAccount')
          .leftJoinAndSelect('campaign.store', 'store')
          .where('campaign.id = :id', { id }),
        user,
      )
      .getOne();

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

}
