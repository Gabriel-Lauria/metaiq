import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationStatus, Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { AccessScopeService } from '../../common/services/access-scope.service';
import { AdAccount } from '../ad-accounts/ad-account.entity';
import { Campaign } from '../campaigns/campaign.entity';
import { StoreIntegration } from '../integrations/store-integration.entity';
import { Manager } from '../managers/manager.entity';
import { Tenant } from '../tenants/tenant.entity';
import { UserStore } from '../user-stores/user-store.entity';
import { User } from '../users/user.entity';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';
import { Store } from './store.entity';

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(Manager)
    private readonly managerRepository: Repository<Manager>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserStore)
    private readonly userStoreRepository: Repository<UserStore>,
    @InjectRepository(AdAccount)
    private readonly adAccountRepository: Repository<AdAccount>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(StoreIntegration)
    private readonly storeIntegrationRepository: Repository<StoreIntegration>,
    private readonly accessScope: AccessScopeService,
  ) {}

  async createForUser(requester: AuthenticatedUser, dto: CreateStoreDto): Promise<Store> {
    const tenantId = await this.resolveTenantIdForWrite(requester, dto.tenantId);
    const managerId = await this.resolveManagerIdForWrite(requester, dto.managerId, tenantId);
    await this.ensureTenantExists(tenantId);
    await this.ensureManagerBelongsToTenant(managerId, tenantId);

    const store = this.storeRepository.create({
      name: dto.name.trim(),
      managerId,
      tenantId,
      createdByUserId: requester.id,
      active: true,
    });

    const savedStore = await this.storeRepository.save(store);

    if (this.accessScope.isManager(requester)) {
      const existingLink = await this.userStoreRepository.findOne({
        where: { userId: requester.id, storeId: savedStore.id },
      });

      if (!existingLink) {
        await this.userStoreRepository.save(
          this.userStoreRepository.create({
            userId: requester.id,
            storeId: savedStore.id,
          }),
        );
      }
    }

    return savedStore;
  }

  async findAllForUser(requester: AuthenticatedUser): Promise<Store[]> {
    const query = this.storeRepository
      .createQueryBuilder('store')
      .leftJoinAndSelect('store.manager', 'manager')
      .orderBy('store.createdAt', 'DESC');

    await this.accessScope.applyStoreScope(query, 'store', requester, { activeOnly: false });
    return query.getMany();
  }

  async findAccessibleForUser(requester: AuthenticatedUser): Promise<Store[]> {
    if (this.accessScope.isPlatformAdmin(requester) || this.accessScope.isAdmin(requester) || this.accessScope.isManager(requester)) {
      const query = this.storeRepository
        .createQueryBuilder('store')
        .leftJoinAndSelect('store.manager', 'manager')
        .orderBy('store.name', 'ASC');

      await this.accessScope.applyStoreScope(query, 'store', requester);
      return query.getMany();
    }

    const links = await this.userStoreRepository.find({
      where: { userId: requester.id },
      relations: ['store', 'store.manager', 'store.tenant'],
      order: { createdAt: 'ASC' },
    });

    return links
      .map((link) => link.store)
      .filter((store): store is Store => !!store && store.active && !store.deletedAt);
  }

  async findOneForUser(requester: AuthenticatedUser, id: string): Promise<Store> {
    return this.accessScope.validateStoreAccess(requester, id);
  }

  async updateForUser(requester: AuthenticatedUser, id: string, dto: UpdateStoreDto): Promise<Store> {
    const store = await this.findOneForUser(requester, id);

    if (dto.name !== undefined) {
      store.name = dto.name.trim();
    }

    if (dto.active !== undefined) {
      store.active = dto.active;
    }

    if (dto.managerId !== undefined) {
      if (!this.accessScope.isPlatformAdmin(requester)) {
        throw new ForbiddenException('Apenas PLATFORM_ADMIN pode alterar managerId legado da store');
      }

      store.managerId = dto.managerId;
    }

    if (dto.tenantId !== undefined) {
      if (!this.accessScope.isPlatformAdmin(requester)) {
        throw new ForbiddenException('Apenas PLATFORM_ADMIN pode alterar o tenant da store');
      }

      await this.ensureTenantExists(dto.tenantId);
      await this.ensureStoreCanMoveTenant(store, dto.tenantId);
      store.tenantId = dto.tenantId;
    }

    await this.ensureManagerBelongsToTenant(store.managerId, store.tenantId);

    return this.storeRepository.save(store);
  }

  async toggleActiveForUser(requester: AuthenticatedUser, id: string): Promise<Store> {
    const store = await this.findOneForUser(requester, id);
    store.active = !store.active;
    return this.storeRepository.save(store);
  }

  async removeForUser(requester: AuthenticatedUser, id: string): Promise<void> {
    const store = await this.findOneForUser(requester, id);
    const dependencies = await this.countBlockingDependencies(store.id);
    const totalDependencies = Object.values(dependencies).reduce((total, count) => total + count, 0);

    if (totalDependencies > 0) {
      throw new ConflictException(
        `Loja possui dependências e não pode ser excluída com segurança: ${this.formatDependencies(dependencies)}.`,
      );
    }

    await this.userStoreRepository.delete({ storeId: store.id });
    store.active = false;
    store.deletedAt = new Date();
    await this.storeRepository.save(store);
  }

  async listUsersForUser(requester: AuthenticatedUser, storeId: string): Promise<Omit<User, 'password'>[]> {
    await this.findOneForUser(requester, storeId);

    const links = await this.userStoreRepository.find({
      where: { storeId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });

    const visibleUsers: Omit<User, 'password'>[] = [];

    for (const link of links) {
      if (!link.user?.active || link.user.deletedAt) {
        continue;
      }

      if (await this.accessScope.canAccessUser(requester, link.user.id)) {
        const { password: _password, ...user } = link.user;
        visibleUsers.push(user);
      }
    }

    return visibleUsers;
  }

  async linkUserToStoreForUser(
    requester: AuthenticatedUser,
    storeId: string,
    userId: string,
  ): Promise<UserStore> {
    const store = await this.findOneForUser(requester, storeId);
    const user = await this.findUserForLink(userId, requester);

    this.validateLinkTenant(requester, store, user);

    const existing = await this.userStoreRepository.findOne({
      where: { storeId, userId },
    });
    if (existing) {
      throw new ConflictException('Usuário já vinculado a esta store');
    }

    const link = this.userStoreRepository.create({ storeId, userId });
    return this.userStoreRepository.save(link);
  }

  async unlinkUserFromStoreForUser(
    requester: AuthenticatedUser,
    storeId: string,
    userId: string,
  ): Promise<void> {
    const store = await this.findOneForUser(requester, storeId);
    const user = await this.findUserForLink(userId, requester);

    this.validateLinkTenant(requester, store, user);

    const result = await this.userStoreRepository.delete({ storeId, userId });
    if (!result.affected) {
      throw new NotFoundException('Vínculo usuário-store não encontrado');
    }
  }

  private async findUserForLink(userId: string, requester: AuthenticatedUser): Promise<User> {
    const user = await this.accessScope.validateUserAccess(requester, userId);
    if (!user.active) {
      throw new NotFoundException('Usuário não encontrado');
    }

    this.assertRequesterCanManageStoreUserLink(requester, user);

    return user;
  }

  private async resolveTenantIdForWrite(
    requester: AuthenticatedUser,
    payloadTenantId?: string,
  ): Promise<string> {
    if (this.accessScope.isPlatformAdmin(requester)) {
      if (!payloadTenantId) {
        throw new BadRequestException('tenantId é obrigatório para PLATFORM_ADMIN criar store');
      }

      return payloadTenantId;
    }

    if (!(this.accessScope.isAdmin(requester) || this.accessScope.isManager(requester)) || !requester.tenantId) {
      throw new ForbiddenException('Apenas PLATFORM_ADMIN, ADMIN ou MANAGER podem gerenciar stores do tenant');
    }

    return requester.tenantId;
  }

  private async resolveManagerIdForWrite(
    requester: AuthenticatedUser,
    payloadManagerId: string | undefined,
    _tenantId: string,
  ): Promise<string> {
    if (this.accessScope.isPlatformAdmin(requester)) {
      if (!payloadManagerId) {
        throw new BadRequestException('managerId é obrigatório para PLATFORM_ADMIN criar store');
      }

      return payloadManagerId;
    }

    if (!requester.managerId) {
      throw new BadRequestException('managerId do usuário autenticado é obrigatório');
    }

    if (payloadManagerId && payloadManagerId !== requester.managerId) {
      throw new ForbiddenException('MANAGER ou ADMIN não podem criar store com managerId diferente do próprio escopo');
    }

    return requester.managerId;
  }

  private async ensureManagerExists(managerId: string): Promise<Manager> {
    const manager = await this.managerRepository.findOne({ where: { id: managerId } });
    if (!manager || !manager.active) {
      throw new NotFoundException('Manager não encontrado');
    }

    return manager;
  }

  private async ensureTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado');
    }
  }

  private async ensureManagerBelongsToTenant(managerId: string, tenantId: string): Promise<void> {
    const manager = await this.ensureManagerExists(managerId);
    await this.ensureTenantExists(tenantId);

    if (manager.id !== tenantId) {
      throw new BadRequestException('managerId deve pertencer ao mesmo tenant da store');
    }
  }

  private validateLinkTenant(requester: AuthenticatedUser, store: Store, user: User): void {
    if (!user.tenantId || user.tenantId !== store.tenantId) {
      throw new ForbiddenException('Usuário e store precisam pertencer ao mesmo tenant');
    }

    if (!this.accessScope.isPlatformAdmin(requester)) {
      this.accessScope.validateTenantAccess(requester, user.tenantId);
    }

    if ([Role.PLATFORM_ADMIN, Role.ADMIN].includes(user.role)) {
      throw new ForbiddenException('ADMIN não deve ser vinculado a stores');
    }
  }

  private assertRequesterCanManageStoreUserLink(requester: AuthenticatedUser, user: User): void {
    if (!this.accessScope.isManager(requester)) {
      return;
    }

    if (![Role.OPERATIONAL, Role.CLIENT].includes(user.role)) {
      throw new ForbiddenException('MANAGER só pode vincular usuários OPERATIONAL ou CLIENT a stores');
    }
  }

  private async ensureStoreCanMoveTenant(store: Store, nextTenantId: string): Promise<void> {
    if (store.tenantId === nextTenantId) {
      return;
    }

    const linkedUsers = await this.userStoreRepository.count({ where: { storeId: store.id } });
    if (linkedUsers > 0) {
      throw new BadRequestException('Store com usuários vinculados não pode trocar de manager');
    }
  }

  private async countBlockingDependencies(storeId: string): Promise<Record<string, number>> {
    const [campaigns, adAccounts, connectedIntegrations] = await Promise.all([
      this.campaignRepository.count({ where: { storeId } }),
      this.adAccountRepository.count({ where: { storeId } }),
      this.storeIntegrationRepository.count({
        where: { storeId, status: IntegrationStatus.CONNECTED },
      }),
    ]);

    return {
      campaigns,
      adAccounts,
      connectedIntegrations,
    };
  }

  private formatDependencies(dependencies: Record<string, number>): string {
    const labels: Record<string, string> = {
      campaigns: 'campanha(s)',
      adAccounts: 'conta(s) de anúncio',
      connectedIntegrations: 'integração(ões) Meta conectada(s)',
    };

    return Object.entries(dependencies)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => `${count} ${labels[key] ?? key}`)
      .join(', ');
  }
}
