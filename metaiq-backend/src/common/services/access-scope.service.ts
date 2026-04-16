import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SelectQueryBuilder, Repository } from 'typeorm';
import { Role } from '../enums';
import { AuthenticatedUser } from '../interfaces';
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
        where: { tenantId: user.tenantId, active: true },
        select: ['id'],
      });
      return stores.map((store) => store.id);
    }

    const links = await this.userStoreRepository.find({
      where: { userId: user.id },
      select: ['storeId'],
    });
    return links.map((link) => link.storeId);
  }

  async validateStoreAccess(user: AuthenticatedUser, storeId?: string | null): Promise<Store> {
    if (!storeId) {
      throw new BadRequestException('storeId é obrigatório');
    }

    const store = await this.storeRepository.findOne({ where: { id: storeId } });
    if (!store || !store.active) {
      throw new NotFoundException('Store não encontrada');
    }

    if (this.isPlatformAdmin(user)) {
      return store;
    }

    if (this.isAdmin(user) || this.isManager(user)) {
      if (user.tenantId && store.tenantId === user.tenantId) {
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

  async applyCampaignScope<T>(
    query: SelectQueryBuilder<T>,
    alias: string,
    user: AuthenticatedUser,
  ): Promise<SelectQueryBuilder<T>> {
    if (this.isPlatformAdmin(user)) {
      return query;
    }

    query
      .leftJoin(`${alias}.store`, `${alias}_scopeStore`)
      .leftJoin(`${alias}.user`, `${alias}_scopeOwner`);

    if (this.isAdmin(user) || this.isManager(user)) {
      if (!user.tenantId) {
        return query.andWhere('1 = 0');
      }

      return query.andWhere(
        `(
          (${alias}.storeId IS NOT NULL AND ${alias}_scopeStore.tenantId = :scopeTenantId)
          OR (${alias}.storeId IS NULL AND ${alias}_scopeOwner.tenantId = :scopeTenantId)
        )`,
        { scopeTenantId: user.tenantId },
      );
    }

    const storeIds = await this.getAllowedStoreIds(user);
    if (!storeIds?.length) {
      return query.andWhere(`(${alias}.storeId IS NULL AND ${alias}.userId = :scopeUserId)`, {
        scopeUserId: user.id,
      });
    }

    return query.andWhere(
      `(
        ${alias}.storeId IN (:...scopeStoreIds)
        OR (${alias}.storeId IS NULL AND ${alias}.userId = :scopeUserId)
      )`,
      { scopeStoreIds: storeIds, scopeUserId: user.id },
    );
  }

  async applyAdAccountScope<T>(
    query: SelectQueryBuilder<T>,
    alias: string,
    user: AuthenticatedUser,
  ): Promise<SelectQueryBuilder<T>> {
    if (this.isPlatformAdmin(user)) {
      return query;
    }

    query
      .leftJoin(`${alias}.store`, `${alias}_scopeStore`)
      .leftJoin(`${alias}.user`, `${alias}_scopeOwner`);

    if (this.isAdmin(user) || this.isManager(user)) {
      if (!user.tenantId) {
        return query.andWhere('1 = 0');
      }

      return query.andWhere(
        `(
          (${alias}.storeId IS NOT NULL AND ${alias}_scopeStore.tenantId = :scopeTenantId)
          OR (${alias}.storeId IS NULL AND ${alias}_scopeOwner.tenantId = :scopeTenantId)
        )`,
        { scopeTenantId: user.tenantId },
      );
    }

    const storeIds = await this.getAllowedStoreIds(user);
    if (!storeIds?.length) {
      return query.andWhere(`(${alias}.storeId IS NULL AND ${alias}.userId = :scopeUserId)`, {
        scopeUserId: user.id,
      });
    }

    return query.andWhere(
      `(
        ${alias}.storeId IN (:...scopeStoreIds)
        OR (${alias}.storeId IS NULL AND ${alias}.userId = :scopeUserId)
      )`,
      { scopeStoreIds: storeIds, scopeUserId: user.id },
    );
  }
}
