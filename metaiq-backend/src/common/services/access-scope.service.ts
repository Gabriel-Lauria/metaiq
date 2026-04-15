import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SelectQueryBuilder, Repository } from 'typeorm';
import { Role } from '../enums/role.enum';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { Store } from '../../modules/stores/store.entity';
import { UserStore } from '../../modules/user-stores/user-store.entity';

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

  async assertCanAccessStore(user: AuthenticatedUser, storeId?: string | null): Promise<void> {
    if (!storeId || this.isAdmin(user)) {
      return;
    }

    if (user.role === Role.MANAGER) {
      const exists = await this.storeRepository.exist({
        where: { id: storeId, managerId: user.managerId ?? undefined },
      });
      if (exists) return;
    }

    if (user.role === Role.OPERATIONAL || user.role === Role.CLIENT) {
      const exists = await this.userStoreRepository.exist({
        where: { userId: user.id, storeId },
      });
      if (exists) return;
    }

    throw new ForbiddenException('Acesso negado à loja informada');
  }

  applyCampaignScope<T>(
    query: SelectQueryBuilder<T>,
    user: AuthenticatedUser,
    campaignAlias = 'campaign',
  ): SelectQueryBuilder<T> {
    if (this.isAdmin(user)) {
      return query;
    }

    if (user.role === Role.MANAGER) {
      return query
        .innerJoin(`${campaignAlias}.store`, 'scope_campaign_store')
        .andWhere('scope_campaign_store.managerId = :scopeManagerId', {
          scopeManagerId: user.managerId,
        });
    }

    return query
      .innerJoin(`${campaignAlias}.store`, 'scope_campaign_store')
      .innerJoin('scope_campaign_store.userStores', 'scope_campaign_user_store')
      .andWhere('scope_campaign_user_store.userId = :scopeUserId', {
        scopeUserId: user.id,
      });
  }

  applyAdAccountScope<T>(
    query: SelectQueryBuilder<T>,
    user: AuthenticatedUser,
    adAccountAlias = 'adAccount',
  ): SelectQueryBuilder<T> {
    if (this.isAdmin(user)) {
      return query;
    }

    if (user.role === Role.MANAGER) {
      return query
        .innerJoin(`${adAccountAlias}.store`, 'scope_ad_store')
        .andWhere('scope_ad_store.managerId = :scopeManagerId', {
          scopeManagerId: user.managerId,
        });
    }

    return query
      .innerJoin(`${adAccountAlias}.store`, 'scope_ad_store')
      .innerJoin('scope_ad_store.userStores', 'scope_ad_user_store')
      .andWhere('scope_ad_user_store.userId = :scopeUserId', {
        scopeUserId: user.id,
      });
  }

  applyUserScope<T>(
    query: SelectQueryBuilder<T>,
    user: AuthenticatedUser,
    userAlias = 'user',
  ): SelectQueryBuilder<T> {
    if (this.isAdmin(user)) {
      return query;
    }

    if (user.role === Role.MANAGER) {
      return query.andWhere(`${userAlias}.managerId = :scopeManagerId`, {
        scopeManagerId: user.managerId,
      });
    }

    return query.andWhere(`${userAlias}.id = :scopeUserId`, { scopeUserId: user.id });
  }
}
