import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, SelectQueryBuilder, Repository } from 'typeorm';
import { Role } from '../enums';
import { AuthenticatedUser } from '../interfaces';
import { OwnershipResource } from '../decorators/check-ownership.decorator';
import { Store } from '../../modules/stores/store.entity';
import { UserStore } from '../../modules/user-stores/user-store.entity';
import { Campaign } from '../../modules/campaigns/campaign.entity';
import { AdAccount } from '../../modules/ad-accounts/ad-account.entity';
import { Insight } from '../../modules/insights/insight.entity';

@Injectable()
export class AccessScopeService {
  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(UserStore)
    private readonly userStoreRepository: Repository<UserStore>,
  ) {}

  isAdmin(user: AuthenticatedUser): boolean {
    return user.role === Role.ADMIN;
  }

  isPlatformAdmin(user: AuthenticatedUser): boolean {
    return user.role === Role.PLATFORM_ADMIN;
  }

  isManager(user: AuthenticatedUser): boolean {
    return user.role === Role.MANAGER;
  }

  isOperational(user: AuthenticatedUser): boolean {
    return user.role === Role.OPERATIONAL;
  }

  isClient(user: AuthenticatedUser): boolean {
    return user.role === Role.CLIENT;
  }

  async getAllowedStoreIds(user: AuthenticatedUser): Promise<string[] | null> {
    if (this.isPlatformAdmin(user)) {
      return null;
    }

    if (this.isAdmin(user) || this.isManager(user)) {
      if (!user.tenantId) {
        return [];
      }

      const stores = await this.storeRepository.find({
        where: {
          tenantId: user.tenantId,
          active: true,
          deletedAt: IsNull(),
          ...(this.isManager(user) ? { createdByUserId: user.id } : {}),
        },
        select: ['id'],
      });
      return stores.map((store) => store.id);
    }

    const links = await this.userStoreRepository.find({
      where: { userId: user.id },
      relations: ['store'],
    });
    return links
      .filter((link) => link.store?.active && !link.store.deletedAt)
      .map((link) => link.storeId);
  }

  async validateStoreAccess(user: AuthenticatedUser, storeId?: string | null): Promise<Store> {
    if (!storeId) {
      throw new BadRequestException('storeId é obrigatório');
    }

    const store = await this.storeRepository.findOne({ where: { id: storeId, deletedAt: IsNull() } });
    if (!store || !store.active) {
      throw new NotFoundException('Store não encontrada');
    }

    if (this.isPlatformAdmin(user)) {
      return store;
    }

    if (this.isAdmin(user) || this.isManager(user)) {
      if (user.tenantId && store.tenantId === user.tenantId) {
        if (this.isManager(user) && store.createdByUserId !== user.id) {
          throw new ForbiddenException('Store fora do escopo do manager');
        }

        return store;
      }

      throw new ForbiddenException('Store fora do tenant do usuário');
    }

    const link = await this.userStoreRepository.findOne({
      where: { userId: user.id, storeId },
    });

    if (!link) {
      throw new ForbiddenException('Usuário sem acesso à store');
    }

    return store;
  }

  validateTenantAccess(user: AuthenticatedUser, tenantId?: string | null): void {
    if (this.isPlatformAdmin(user)) {
      return;
    }

    if (!tenantId || user.tenantId !== tenantId) {
      throw new ForbiddenException('Tenant fora do escopo do usuário');
    }
  }

  async canAccessCampaign(user: AuthenticatedUser, campaignId: string): Promise<boolean> {
    const query = this.storeRepository.manager
      .getRepository(Campaign)
      .createQueryBuilder('campaign')
      .where('campaign.id = :campaignId', { campaignId });

    await this.applyCampaignScope(query, 'campaign', user);
    return query.getExists();
  }

  async canAccessMetricCampaign(user: AuthenticatedUser, campaignId: string): Promise<boolean> {
    return this.canAccessCampaign(user, campaignId);
  }

  async canAccessAdAccount(user: AuthenticatedUser, adAccountId: string): Promise<boolean> {
    const query = this.storeRepository.manager
      .getRepository(AdAccount)
      .createQueryBuilder('adAccount')
      .where('adAccount.id = :adAccountId', { adAccountId });

    await this.applyAdAccountScope(query, 'adAccount', user);
    return query.getExists();
  }

  async canAccessInsight(user: AuthenticatedUser, insightId: string): Promise<boolean> {
    const query = this.storeRepository.manager
      .getRepository(Insight)
      .createQueryBuilder('insight')
      .innerJoin('insight.campaign', 'campaign')
      .where('insight.id = :insightId', { insightId });

    await this.applyCampaignScope(query, 'campaign', user);
    return query.getExists();
  }

  async canAccessResource(
    user: AuthenticatedUser,
    resource: OwnershipResource,
    id: string,
  ): Promise<boolean> {
    switch (resource) {
      case 'campaign':
        return this.canAccessCampaign(user, id);
      case 'metricCampaign':
        return this.canAccessMetricCampaign(user, id);
      case 'adAccount':
        return this.canAccessAdAccount(user, id);
      case 'insight':
        return this.canAccessInsight(user, id);
      default:
        return false;
    }
  }

  async applyCampaignScope<T>(
    query: SelectQueryBuilder<T>,
    alias: string,
    user: AuthenticatedUser,
  ): Promise<SelectQueryBuilder<T>> {
    if (this.isPlatformAdmin(user)) {
      return query;
    }

    query.innerJoin(`${alias}.store`, `${alias}_scopeStore`);

    if (this.isAdmin(user) || this.isManager(user)) {
      if (!user.tenantId) {
        return query.andWhere('1 = 0');
      }

      query
        .andWhere(`${alias}_scopeStore.tenantId = :scopeTenantId`, {
          scopeTenantId: user.tenantId,
        })
        .andWhere(`${alias}_scopeStore.deletedAt IS NULL`);

      if (this.isManager(user)) {
        query.andWhere(`${alias}_scopeStore.createdByUserId = :scopeManagerUserId`, {
          scopeManagerUserId: user.id,
        });
      }

      return query;
    }

    const storeIds = await this.getAllowedStoreIds(user);
    if (!storeIds?.length) {
      return query.andWhere('1 = 0');
    }

    return query.andWhere(`${alias}.storeId IN (:...scopeStoreIds)`, {
      scopeStoreIds: storeIds,
    });
  }

  async applyAdAccountScope<T>(
    query: SelectQueryBuilder<T>,
    alias: string,
    user: AuthenticatedUser,
  ): Promise<SelectQueryBuilder<T>> {
    if (this.isPlatformAdmin(user)) {
      return query;
    }

    query.innerJoin(`${alias}.store`, `${alias}_scopeStore`);

    if (this.isAdmin(user) || this.isManager(user)) {
      if (!user.tenantId) {
        return query.andWhere('1 = 0');
      }

      query
        .andWhere(`${alias}_scopeStore.tenantId = :scopeTenantId`, {
          scopeTenantId: user.tenantId,
        })
        .andWhere(`${alias}_scopeStore.deletedAt IS NULL`);

      if (this.isManager(user)) {
        query.andWhere(`${alias}_scopeStore.createdByUserId = :scopeManagerUserId`, {
          scopeManagerUserId: user.id,
        });
      }

      return query;
    }

    const storeIds = await this.getAllowedStoreIds(user);
    if (!storeIds?.length) {
      return query.andWhere('1 = 0');
    }

    return query.andWhere(`${alias}.storeId IN (:...scopeStoreIds)`, {
      scopeStoreIds: storeIds,
    });
  }

  async applyStoreScope<T>(
    query: SelectQueryBuilder<T>,
    alias: string,
    user: AuthenticatedUser,
    options: { activeOnly?: boolean } = {},
  ): Promise<SelectQueryBuilder<T>> {
    const activeOnly = options.activeOnly ?? true;
    if (this.isPlatformAdmin(user)) {
      query.andWhere(`${alias}.deletedAt IS NULL`);
      if (activeOnly) {
        query.andWhere(`${alias}.active = :scopeStoreActive`, { scopeStoreActive: true });
      }
      return query;
    }

    if (this.isAdmin(user) || this.isManager(user)) {
      if (!user.tenantId) {
        return query.andWhere('1 = 0');
      }

      query
        .andWhere(`${alias}.tenantId = :scopeTenantId`, { scopeTenantId: user.tenantId })
        .andWhere(`${alias}.deletedAt IS NULL`);

      if (activeOnly) {
        query.andWhere(`${alias}.active = :scopeStoreActive`, { scopeStoreActive: true });
      }

      if (this.isManager(user)) {
        query.andWhere(`${alias}.createdByUserId = :scopeManagerUserId`, {
          scopeManagerUserId: user.id,
        });
      }

      return query;
    }

    const storeIds = await this.getAllowedStoreIds(user);
    if (!storeIds?.length) {
      return query.andWhere('1 = 0');
    }

    query.andWhere(`${alias}.id IN (:...scopeStoreIds)`, { scopeStoreIds: storeIds });
    if (activeOnly) {
      query.andWhere(`${alias}.active = :scopeStoreActive`, { scopeStoreActive: true });
    }
    return query.andWhere(`${alias}.deletedAt IS NULL`);
  }

  async applyUserScope<T>(
    query: SelectQueryBuilder<T>,
    alias: string,
    user: AuthenticatedUser,
  ): Promise<SelectQueryBuilder<T>> {
    if (this.isPlatformAdmin(user)) {
      return query.andWhere(`${alias}.deletedAt IS NULL`);
    }

    if (this.isAdmin(user) || this.isManager(user)) {
      if (!user.tenantId) {
        return query.andWhere('1 = 0');
      }

      query
        .andWhere(`${alias}.tenantId = :scopeTenantId`, { scopeTenantId: user.tenantId })
        .andWhere(`${alias}.deletedAt IS NULL`);

      if (this.isManager(user)) {
        query.andWhere(`(${alias}.createdByUserId = :scopeManagerUserId OR ${alias}.id = :scopeManagerUserId)`, {
          scopeManagerUserId: user.id,
        });
      }

      return query;
    }

    return query
      .andWhere(`${alias}.id = :scopeUserId`, { scopeUserId: user.id })
      .andWhere(`${alias}.deletedAt IS NULL`);
  }

  async applyMetricScope<T>(
    query: SelectQueryBuilder<T>,
    campaignAlias: string,
    user: AuthenticatedUser,
  ): Promise<SelectQueryBuilder<T>> {
    return this.applyCampaignScope(query, campaignAlias, user);
  }

  async applyInsightScope<T>(
    query: SelectQueryBuilder<T>,
    campaignAlias: string,
    user: AuthenticatedUser,
  ): Promise<SelectQueryBuilder<T>> {
    return this.applyCampaignScope(query, campaignAlias, user);
  }
}
