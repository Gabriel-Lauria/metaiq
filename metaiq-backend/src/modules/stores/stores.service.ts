import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { AccessScopeService } from '../../common/services/access-scope.service';
import { Manager } from '../managers/manager.entity';
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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserStore)
    private readonly userStoreRepository: Repository<UserStore>,
    private readonly accessScope: AccessScopeService,
  ) {}

  async create(requester: AuthenticatedUser, dto: CreateStoreDto): Promise<Store> {
    const managerId = await this.resolveManagerIdForWrite(requester, dto.managerId);
    await this.ensureManagerExists(managerId);

    const store = this.storeRepository.create({
      name: dto.name.trim(),
      managerId,
      active: true,
    });

    return this.storeRepository.save(store);
  }

  async findAll(requester: AuthenticatedUser): Promise<Store[]> {
    if (this.accessScope.isAdmin(requester)) {
      return this.storeRepository.find({
        relations: ['manager'],
        order: { createdAt: 'DESC' },
      });
    }

    if (!requester.managerId) {
      return [];
    }

    return this.storeRepository.find({
      where: { managerId: requester.managerId },
      relations: ['manager'],
      order: { createdAt: 'DESC' },
    });
  }

  async findAccessible(requester: AuthenticatedUser): Promise<Store[]> {
    if (this.accessScope.isAdmin(requester)) {
      return this.storeRepository.find({
        where: { active: true },
        relations: ['manager'],
        order: { name: 'ASC' },
      });
    }

    if (this.accessScope.isManager(requester)) {
      if (!requester.managerId) {
        return [];
      }

      return this.storeRepository.find({
        where: { managerId: requester.managerId, active: true },
        relations: ['manager'],
        order: { name: 'ASC' },
      });
    }

    const links = await this.userStoreRepository.find({
      where: { userId: requester.id },
      relations: ['store', 'store.manager'],
      order: { createdAt: 'ASC' },
    });

    return links
      .map((link) => link.store)
      .filter((store): store is Store => !!store && store.active);
  }

  async findOne(id: string, requester: AuthenticatedUser): Promise<Store> {
    const store = await this.findOneUnsafeInternal(id);
    this.accessScope.validateTenantAccess(requester, store.managerId);
    return store;
  }

  async update(id: string, requester: AuthenticatedUser, dto: UpdateStoreDto): Promise<Store> {
    const store = await this.findOne(id, requester);

    if (dto.name !== undefined) {
      store.name = dto.name.trim();
    }

    if (dto.active !== undefined) {
      store.active = dto.active;
    }

    if (dto.managerId !== undefined) {
      if (!this.accessScope.isAdmin(requester)) {
        throw new ForbiddenException('Apenas ADMIN pode alterar o manager da store');
      }

      await this.ensureManagerExists(dto.managerId);
      await this.ensureStoreCanMoveTenant(store, dto.managerId);
      store.managerId = dto.managerId;
    }

    return this.storeRepository.save(store);
  }

  async toggleActive(id: string, requester: AuthenticatedUser): Promise<Store> {
    const store = await this.findOne(id, requester);
    store.active = !store.active;
    return this.storeRepository.save(store);
  }

  async listUsers(storeId: string, requester: AuthenticatedUser): Promise<Omit<User, 'password'>[]> {
    await this.findOne(storeId, requester);

    const links = await this.userStoreRepository.find({
      where: { storeId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });

    return links.map((link) => {
      const { password: _password, ...user } = link.user;
      return user;
    });
  }

  async linkUserToStore(
    storeId: string,
    userId: string,
    requester: AuthenticatedUser,
  ): Promise<UserStore> {
    const store = await this.findOne(storeId, requester);
    const user = await this.findUserForLink(userId);

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

  async unlinkUserFromStore(
    storeId: string,
    userId: string,
    requester: AuthenticatedUser,
  ): Promise<void> {
    const store = await this.findOne(storeId, requester);
    const user = await this.findUserForLink(userId);

    this.validateLinkTenant(requester, store, user);

    const result = await this.userStoreRepository.delete({ storeId, userId });
    if (!result.affected) {
      throw new NotFoundException('Vínculo usuário-store não encontrado');
    }
  }

  private async findOneUnsafeInternal(id: string): Promise<Store> {
    const store = await this.storeRepository.findOne({
      where: { id },
      relations: ['manager'],
    });
    if (!store) {
      throw new NotFoundException('Store não encontrada');
    }

    return store;
  }

  private async findUserForLink(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.active) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return user;
  }

  private async resolveManagerIdForWrite(
    requester: AuthenticatedUser,
    payloadManagerId?: string,
  ): Promise<string> {
    if (this.accessScope.isAdmin(requester)) {
      if (!payloadManagerId) {
        throw new BadRequestException('managerId é obrigatório para ADMIN criar store');
      }

      return payloadManagerId;
    }

    if (!this.accessScope.isManager(requester) || !requester.managerId) {
      throw new ForbiddenException('Apenas ADMIN ou MANAGER podem gerenciar stores');
    }

    return requester.managerId;
  }

  private async ensureManagerExists(managerId: string): Promise<void> {
    const manager = await this.managerRepository.findOne({ where: { id: managerId } });
    if (!manager || !manager.active) {
      throw new NotFoundException('Manager não encontrado');
    }
  }

  private validateLinkTenant(requester: AuthenticatedUser, store: Store, user: User): void {
    if (!user.managerId || user.managerId !== store.managerId) {
      throw new ForbiddenException('Usuário e store precisam pertencer ao mesmo tenant');
    }

    if (!this.accessScope.isAdmin(requester)) {
      this.accessScope.validateTenantAccess(requester, user.managerId);
    }

    if (user.role === Role.ADMIN) {
      throw new ForbiddenException('ADMIN não deve ser vinculado a stores');
    }
  }

  private async ensureStoreCanMoveTenant(store: Store, nextManagerId: string): Promise<void> {
    if (store.managerId === nextManagerId) {
      return;
    }

    const linkedUsers = await this.userStoreRepository.count({ where: { storeId: store.id } });
    if (linkedUsers > 0) {
      throw new BadRequestException('Store com usuários vinculados não pode trocar de manager');
    }
  }
}
