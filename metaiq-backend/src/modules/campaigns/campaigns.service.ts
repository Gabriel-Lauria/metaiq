import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Campaign } from "./campaign.entity";
import {
  PaginationDto,
  PaginatedResponse,
} from "../../common/dto/pagination.dto";
import { AuthenticatedUser } from "../../common/interfaces";
import { AccessScopeService } from "../../common/services/access-scope.service";
import { CreateCampaignDto, UpdateCampaignDto } from "./dto/campaign.dto";

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private campaignRepository: Repository<Campaign>,
    private readonly accessScope: AccessScopeService,
  ) {}

  async createForUser(
    user: AuthenticatedUser,
    dto: CreateCampaignDto,
  ): Promise<Campaign> {
    await this.accessScope.validateStoreAccess(user, dto.storeId);
    await this.validateAdAccountInStoreForUser(
      user,
      dto.adAccountId,
      dto.storeId,
    );

    const campaign = this.campaignRepository.create({
      ...dto,
      status: dto.status ?? "ACTIVE",
      objective: dto.objective ?? "CONVERSIONS",
      startTime: new Date(dto.startTime),
      endTime: dto.endTime ? new Date(dto.endTime) : undefined,
      userId: user.id,
      createdByUserId: user.id,
      storeId: dto.storeId,
    });

    return this.campaignRepository.save(campaign);
  }

  async updateForUser(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateCampaignDto,
  ): Promise<Campaign> {
    const campaign = await this.findOneForUser(user, id);
    const nextStoreId = dto.storeId ?? campaign.storeId;
    const nextAdAccountId = dto.adAccountId ?? campaign.adAccountId;

    if (dto.storeId) {
      await this.accessScope.validateStoreAccess(user, dto.storeId);
    }

    if (nextAdAccountId && nextStoreId) {
      await this.validateAdAccountInStoreForUser(
        user,
        nextAdAccountId,
        nextStoreId,
      );
    }

    Object.assign(campaign, {
      ...dto,
      endTime: dto.endTime ? new Date(dto.endTime) : campaign.endTime,
    });
    return this.campaignRepository.save(campaign);
  }

  async findAllForUser(
    user: AuthenticatedUser,
    filters: { storeId?: string } = {},
  ): Promise<Campaign[]> {
    const query = this.campaignRepository
      .createQueryBuilder("campaign")
      .leftJoinAndSelect("campaign.adAccount", "adAccount")
      .leftJoinAndSelect("campaign.store", "store")
      .orderBy("campaign.createdAt", "DESC");
    await this.accessScope.applyCampaignScope(query, "campaign", user);
    await this.applyStoreFilter(query, user, filters.storeId);
    return query.getMany();
  }

  async findAllPaginatedForUser(
    user: AuthenticatedUser,
    pagination: PaginationDto,
    filters: { storeId?: string } = {},
  ): Promise<PaginatedResponse<Campaign>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const query = this.campaignRepository
      .createQueryBuilder("campaign")
      .leftJoinAndSelect("campaign.adAccount", "adAccount")
      .leftJoinAndSelect("campaign.store", "store")
      .orderBy("campaign.createdAt", "DESC")
      .skip(skip)
      .take(limit);
    await this.accessScope.applyCampaignScope(query, "campaign", user);
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

  async findOneForUser(user: AuthenticatedUser, id: string): Promise<Campaign> {
    return this.accessScope.validateCampaignAccess(user, id);
  }

  private async applyStoreFilter(
    query: ReturnType<Repository<Campaign>["createQueryBuilder"]>,
    user: AuthenticatedUser,
    storeId?: string,
  ): Promise<void> {
    if (!storeId) {
      return;
    }

    await this.accessScope.validateStoreAccess(user, storeId);
    query.andWhere("campaign.storeId = :filterStoreId", {
      filterStoreId: storeId,
    });
  }

  async findAllActiveForSystemJob(): Promise<Campaign[]> {
    return this.campaignRepository.find({
      where: { status: "ACTIVE" },
      relations: ["adAccount", "store"],
      order: { createdAt: "DESC" },
    });
  }

  private async validateAdAccountInStoreForUser(
    user: AuthenticatedUser,
    adAccountId: string,
    storeId: string,
  ): Promise<void> {
    const adAccount = await this.accessScope.validateAdAccountInStoreAccess(
      user,
      storeId,
      adAccountId,
    );

    if (!adAccount.active) {
      throw new ForbiddenException(
        "AdAccount inativa não pode receber novas campanhas",
      );
    }
  }
}
