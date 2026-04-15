import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from './campaign.entity';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../common/interfaces';
import { AccessScopeService } from '../../common/services/access-scope.service';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private campaignRepository: Repository<Campaign>,
    private readonly accessScope: AccessScopeService,
  ) {}

  async create(dto: CreateCampaignDto, user: AuthenticatedUser): Promise<Campaign> {
    await this.accessScope.validateStoreAccess(user, dto.storeId);
    await this.validateAdAccountInStore(dto.adAccountId, dto.storeId, user);

    const campaign = this.campaignRepository.create({
      ...dto,
      status: dto.status ?? 'ACTIVE',
      objective: dto.objective ?? 'CONVERSIONS',
      startTime: new Date(dto.startTime),
      endTime: dto.endTime ? new Date(dto.endTime) : undefined,
      userId: user.id,
      createdByUserId: user.id,
      storeId: dto.storeId,
    });

    return this.campaignRepository.save(campaign);
  }

  async update(id: string, user: AuthenticatedUser, dto: UpdateCampaignDto): Promise<Campaign> {
    const campaign = await this.findOne(id, user);
    const nextStoreId = dto.storeId ?? campaign.storeId;
    const nextAdAccountId = dto.adAccountId ?? campaign.adAccountId;

    if (dto.storeId) {
      await this.accessScope.validateStoreAccess(user, dto.storeId);
    }

    if (nextAdAccountId && nextStoreId) {
      await this.validateAdAccountInStore(nextAdAccountId, nextStoreId, user);
    }

    Object.assign(campaign, {
      ...dto,
      endTime: dto.endTime ? new Date(dto.endTime) : campaign.endTime,
    });
    return this.campaignRepository.save(campaign);
  }

  async findAll(user: AuthenticatedUser, filters: { storeId?: string } = {}): Promise<Campaign[]> {
    const query = this.campaignRepository
      .createQueryBuilder('campaign')
      .leftJoinAndSelect('campaign.adAccount', 'adAccount')
      .leftJoinAndSelect('campaign.store', 'store')
      .orderBy('campaign.createdAt', 'DESC');
    await this.accessScope.applyCampaignScope(query, 'campaign', user);
    await this.applyStoreFilter(query, user, filters.storeId);
    return query.getMany();
  }

  async findAllPaginated(
    user: AuthenticatedUser,
    pagination: PaginationDto,
    filters: { storeId?: string } = {},
  ): Promise<PaginatedResponse<Campaign>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const query = this.campaignRepository
      .createQueryBuilder('campaign')
      .leftJoinAndSelect('campaign.adAccount', 'adAccount')
      .leftJoinAndSelect('campaign.store', 'store')
      .orderBy('campaign.createdAt', 'DESC')
      .skip(skip)
      .take(limit);
    await this.accessScope.applyCampaignScope(query, 'campaign', user);
    await this.applyStoreFilter(query, user, filters.storeId);

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
    const query = this.campaignRepository
      .createQueryBuilder('campaign')
      .leftJoinAndSelect('campaign.adAccount', 'adAccount')
      .leftJoinAndSelect('campaign.store', 'store')
      .where('campaign.id = :id', { id });
    await this.accessScope.applyCampaignScope(query, 'campaign', user);
    const campaign = await query.getOne();

    if (!campaign) {
      throw new NotFoundException(`Campanha ${id} não encontrada`);
    }

    return campaign;
  }

  private async applyStoreFilter(
    query: ReturnType<Repository<Campaign>['createQueryBuilder']>,
    user: AuthenticatedUser,
    storeId?: string,
  ): Promise<void> {
    if (!storeId) {
      return;
    }

    await this.accessScope.validateStoreAccess(user, storeId);
    query.andWhere('campaign.storeId = :filterStoreId', { filterStoreId: storeId });
  }

  async findAllActiveUnsafeInternal(): Promise<Campaign[]> {
    return this.campaignRepository.find({
      where: { status: 'ACTIVE' },
      relations: ['adAccount', 'store'],
      order: { createdAt: 'DESC' },
    });
  }

  private async validateAdAccountInStore(
    adAccountId: string,
    storeId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const adAccount = await this.campaignRepository.manager
      .createQueryBuilder()
      .select('adAccount.id', 'id')
      .from('ad_accounts', 'adAccount')
      .where('adAccount.id = :adAccountId', { adAccountId })
      .andWhere('adAccount.storeId = :storeId', { storeId })
      .getRawOne();

    if (!adAccount) {
      throw new ForbiddenException('AdAccount não pertence à store informada');
    }

    await this.accessScope.validateStoreAccess(user, storeId);
  }
}
