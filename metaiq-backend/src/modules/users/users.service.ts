import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from './user.entity';
import { Manager } from '../managers/manager.entity';
import { Tenant } from '../tenants/tenant.entity';
import { UserStore } from '../user-stores/user-store.entity';
import * as bcrypt from 'bcryptjs';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthenticatedUser } from '../../common/interfaces';
import { AccessScopeService } from '../../common/services/access-scope.service';
import { Role } from '../../common/enums';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateMeDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}

export class ManagerUpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class AdminUpdateUserDto extends ManagerUpdateUserDto {
  @IsOptional()
  @IsString()
  managerId?: string | null;

  @IsOptional()
  @IsString()
  tenantId?: string | null;
}

export class ResetUserPasswordDto {
  @IsString()
  @MinLength(6)
  password: string;
}

@Injectable()
export class UsersService {
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Manager)
    private readonly managerRepository: Repository<Manager>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(UserStore)
    private readonly userStoreRepository: Repository<UserStore>,
    private readonly accessScope: AccessScopeService,
  ) {}

  /**
   * Cria um novo usuário com senha hasheada
   */
  async create(dto: CreateUserDto): Promise<User> {
    return this.createUserWithResolvedScope(dto);
  }

  async createForUser(requester: AuthenticatedUser, dto: CreateUserDto): Promise<User> {
    if (this.accessScope.isPlatformAdmin(requester)) {
      return this.createUserWithResolvedScope(dto, requester.id);
    }

    if (!(this.accessScope.isAdmin(requester) || this.accessScope.isManager(requester)) || !requester.tenantId) {
      throw new ForbiddenException('Apenas ADMIN ou MANAGER podem criar usuários');
    }

    const role = dto.role ?? Role.OPERATIONAL;
    const allowedRoles = this.accessScope.isAdmin(requester)
      ? [Role.MANAGER, Role.OPERATIONAL, Role.CLIENT]
      : [Role.OPERATIONAL, Role.CLIENT];
    if (!allowedRoles.includes(role)) {
      throw new ForbiddenException('MANAGER só pode criar usuários OPERATIONAL ou CLIENT');
    }

    return this.createUserWithResolvedScope({
      ...dto,
      role,
      managerId: requester.managerId,
      tenantId: requester.tenantId,
    }, requester.id);
  }

  /**
   * Busca usuário por email (para login)
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email, deletedAt: IsNull() } });
  }

  /**
   * Busca usuário por ID
   */
  async findOneUnsafeInternal(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id, deletedAt: IsNull() } });
    if (!user) {
      throw new NotFoundException(`Usuário ${id} não encontrado`);
    }
    return user;
  }

  /**
   * Lista todos os usuários (admin/manager)
   */
  async findAllUnsafeInternal(): Promise<User[]> {
    return this.userRepository.find({ where: { deletedAt: IsNull() } });
  }

  async findAllForUser(requester: AuthenticatedUser): Promise<User[]> {
    if (this.accessScope.isPlatformAdmin(requester)) {
      return this.userRepository.find({ where: { deletedAt: IsNull() } });
    }

    if (this.accessScope.isAdmin(requester) || this.accessScope.isManager(requester)) {
      if (!requester.tenantId) {
        return [];
      }

      const query = this.userRepository.createQueryBuilder('user');
      await this.accessScope.applyUserScope(query, 'user', requester);
      return query.getMany();
    }

    return this.userRepository.find({
      where: { id: requester.id, deletedAt: IsNull() },
    });
  }

  async findAuthenticatedProfile(requester: AuthenticatedUser): Promise<User> {
    return this.findOneForUser(requester.id, requester);
  }

  async findOneForUser(id: string, requester: AuthenticatedUser): Promise<User> {
    const user = await this.findOneUnsafeInternal(id);

    if (this.accessScope.isPlatformAdmin(requester) || requester.id === id) {
      return user;
    }

    if (this.accessScope.isAdmin(requester) || this.accessScope.isManager(requester)) {
      this.accessScope.validateTenantAccess(requester, user.tenantId);
      if (this.accessScope.isManager(requester) && user.createdByUserId !== requester.id && user.id !== requester.id) {
        throw new NotFoundException(`Usuário ${id} não encontrado`);
      }
      return user;
    }

    throw new NotFoundException(`Usuário ${id} não encontrado`);
  }

  /**
   * Atualiza dados do usuário
   */
  async updateMe(id: string, dto: UpdateMeDto): Promise<User> {
    const user = await this.findOneUnsafeInternal(id);
    const safeDto: UpdateMeDto = {
      email: dto.email,
      name: dto.name,
      password: dto.password,
    };

    return this.applyUserProfileUpdate(user, safeDto);
  }

  async updateForUser(
    id: string,
    requester: AuthenticatedUser,
    dto: AdminUpdateUserDto,
  ): Promise<User> {
    if ('password' in (dto as Record<string, unknown>)) {
      throw new ForbiddenException(
        'Use o endpoint dedicado para alteração administrativa de senha',
      );
    }

    const user = await this.findOneForUser(id, requester);

    if (dto.managerId !== undefined) {
      if (!this.accessScope.isPlatformAdmin(requester)) {
        throw new ForbiddenException('Apenas PLATFORM_ADMIN pode alterar managerId');
      }

      if (requester.id === user.id) {
        throw new ForbiddenException('Usuário não pode alterar o próprio tenant');
      }

      user.managerId = dto.managerId;
    }

    if (dto.tenantId !== undefined) {
      if (!this.accessScope.isPlatformAdmin(requester)) {
        throw new ForbiddenException('Apenas PLATFORM_ADMIN pode alterar tenantId');
      }

      if (requester.id === user.id) {
        throw new ForbiddenException('Usuário não pode alterar o próprio tenant');
      }

      if (!dto.tenantId) {
        throw new BadRequestException('tenantId é obrigatório');
      }

      await this.ensureTenantExists(dto.tenantId);
      user.tenantId = dto.tenantId;
    }

    return this.applyUserProfileUpdate(user, dto);
  }

  async resetPasswordAsAdmin(
    id: string,
    requester: AuthenticatedUser,
    dto: ResetUserPasswordDto,
  ): Promise<User> {
    if (!(this.accessScope.isPlatformAdmin(requester) || this.accessScope.isAdmin(requester) || this.accessScope.isManager(requester))) {
      throw new ForbiddenException('Apenas PLATFORM_ADMIN, ADMIN ou MANAGER podem alterar a senha de usuários no próprio escopo');
    }

    const user = await this.findOneForUser(id, requester);
    if (this.accessScope.isManager(requester) && ![Role.OPERATIONAL, Role.CLIENT].includes(user.role)) {
      throw new ForbiddenException('MANAGER só pode alterar senha de OPERATIONAL ou CLIENT');
    }
    return this.applyUserProfileUpdate(user, { password: dto.password });
  }

  private async applyUserProfileUpdate(user: User, dto: UpdateMeDto): Promise<User> {

    // Se tentando mudar email, verifica se não existe outro com esse email
    if (dto.email && dto.email !== user.email) {
      const existing = await this.userRepository.findOne({
        where: { email: dto.email },
      });
      if (existing) {
        throw new ConflictException('Email já em uso');
      }
      user.email = dto.email;
    }

    if (dto.name) {
      user.name = dto.name;
    }

    // Se forneceu nova senha, faz hash
    if (dto.password) {
      if (dto.password.length < 6) {
        throw new BadRequestException('Senha deve ter no mínimo 6 caracteres');
      }
      user.password = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);
    }

    return this.userRepository.save(user);
  }

  /**
   * Delete (soft delete — marca como inativo)
   */
  async remove(id: string): Promise<void> {
    const user = await this.findOneUnsafeInternal(id);
    await this.ensureCanDeleteUser(user, user);
    await this.softDeleteUser(user);
  }

  async removeForUser(id: string, requester: AuthenticatedUser): Promise<void> {
    const user = await this.findOneForUser(id, requester);
    await this.ensureCanDeleteUser(user, requester);
    await this.softDeleteUser(user);
  }

  private async softDeleteUser(user: User): Promise<void> {
    await this.userStoreRepository.delete({ userId: user.id });
    user.active = false;
    user.refreshToken = null;
    user.deletedAt = new Date();
    await this.userRepository.save(user);
  }

  /**
   * Valida credenciais (para login)
   */
  async validatePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  private async createUserWithResolvedScope(dto: CreateUserDto, createdByUserId?: string | null): Promise<User> {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email já cadastrado');
    }

    const role = dto.role ?? Role.OPERATIONAL;
    const tenantId = await this.resolveTenantIdForCreate(role, dto.tenantId, dto.managerId);
    const managerId = [Role.PLATFORM_ADMIN, Role.ADMIN].includes(role) ? dto.managerId ?? null : dto.managerId ?? tenantId;

    if (tenantId) {
      await this.ensureTenantExists(tenantId);
    }

    if (managerId) {
      const manager = await this.managerRepository.findOne({ where: { id: managerId } });
      if (!manager || !manager.active) {
        throw new BadRequestException('managerId inválido');
      }
    }

    const hashedPassword = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

    const user = this.userRepository.create({
      email: dto.email,
      password: hashedPassword,
      name: dto.name,
      role,
      managerId,
      tenantId,
      createdByUserId: createdByUserId ?? null,
      active: dto.active ?? true,
      deletedAt: null,
    });

    return this.userRepository.save(user);
  }

  private async resolveTenantIdForCreate(
    role: Role,
    payloadTenantId?: string,
    legacyManagerId?: string,
  ): Promise<string | null> {
    if (role === Role.PLATFORM_ADMIN) {
      return null;
    }

    const tenantId = payloadTenantId ?? legacyManagerId;
    if (!tenantId) {
      throw new BadRequestException(
        role === Role.ADMIN
          ? 'tenantId é obrigatório para usuário ADMIN'
          : 'tenantId é obrigatório para usuário não-admin',
      );
    }

    return tenantId;
  }

  private async ensureTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId, deletedAt: IsNull() } });
    if (!tenant || !tenant.active) {
      throw new BadRequestException('tenantId inválido');
    }
  }

  private async ensureCanDeleteUser(user: User, requester: AuthenticatedUser | User): Promise<void> {
    if (user.role === Role.PLATFORM_ADMIN) {
      throw new ForbiddenException('PLATFORM_ADMIN não pode ser excluído pelo fluxo comum');
    }

    if (this.isRequesterManager(requester) && ![Role.OPERATIONAL, Role.CLIENT].includes(user.role)) {
      throw new ForbiddenException('MANAGER só pode excluir OPERATIONAL ou CLIENT');
    }

    if (user.role === Role.ADMIN && user.tenantId) {
      const activeAdmins = await this.userRepository.count({
        where: {
          tenantId: user.tenantId,
          role: Role.ADMIN,
          active: true,
          deletedAt: IsNull(),
        },
      });

      if (activeAdmins <= 1) {
        throw new ForbiddenException('Não é permitido excluir o último administrador da empresa');
      }
    }
  }

  private isRequesterManager(requester: AuthenticatedUser | User): boolean {
    return requester.role === Role.MANAGER;
  }
}
