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
import { AccountType, Role } from '../../common/enums';
import { UpdateMyCompanyDto } from './company-profile.dto';

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

export type UserResponseView = Omit<User, 'password'> & {
  accountType: AccountType | null;
  storeId: string | null;
  businessName: string | null;
  businessSegment: string | null;
  defaultCity: string | null;
  defaultState: string | null;
  website: string | null;
  instagram: string | null;
  whatsapp: string | null;
};

export type CompanyProfileResponseView = {
  businessName: string | null;
  businessSegment: string | null;
  defaultCity: string | null;
  defaultState: string | null;
  website: string | null;
  instagram: string | null;
  whatsapp: string | null;
};

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
    return this.findOneForUser(requester, requester.id);
  }

  async toUserResponseView(user: User): Promise<UserResponseView> {
    const { password: _password, ...userWithoutPassword } = user;
    const tenantProfile = await this.resolveTenantProfile(user.tenantId);
    const accountType = tenantProfile?.accountType ?? null;
    return {
      ...userWithoutPassword,
      accountType,
      storeId: await this.resolveStoreId(user.id, accountType),
      businessName: tenantProfile?.businessName ?? null,
      businessSegment: tenantProfile?.businessSegment ?? null,
      defaultCity: tenantProfile?.defaultCity ?? null,
      defaultState: tenantProfile?.defaultState ?? null,
      website: tenantProfile?.website ?? null,
      instagram: tenantProfile?.instagram ?? null,
      whatsapp: tenantProfile?.whatsapp ?? null,
    };
  }

  async getMyCompanyForUser(requester: AuthenticatedUser): Promise<CompanyProfileResponseView> {
    const tenant = await this.loadIndividualTenantForUser(requester);
    return this.toCompanyProfileResponseView(tenant);
  }

  async updateMyCompanyForUser(
    requester: AuthenticatedUser,
    dto: UpdateMyCompanyDto,
  ): Promise<CompanyProfileResponseView> {
    const tenant = await this.loadIndividualTenantForUser(requester);

    if (dto.businessName !== undefined) {
      const businessName = this.cleanNullable(dto.businessName);
      if (!businessName) {
        throw new BadRequestException('businessName não pode ser vazio');
      }
      tenant.businessName = businessName;
      tenant.name = businessName;
    }

    if (dto.businessSegment !== undefined) {
      tenant.businessSegment = this.cleanNullable(dto.businessSegment);
    }

    if (dto.defaultCity !== undefined) {
      tenant.defaultCity = this.cleanNullable(dto.defaultCity);
    }

    if (dto.defaultState !== undefined) {
      tenant.defaultState = this.cleanNullable(dto.defaultState)?.toUpperCase() ?? null;
    }

    if (dto.website !== undefined) {
      tenant.website = this.cleanNullable(dto.website);
    }

    if (dto.instagram !== undefined) {
      tenant.instagram = this.normalizeInstagram(dto.instagram);
    }

    if (dto.whatsapp !== undefined) {
      tenant.whatsapp = this.cleanNullable(dto.whatsapp);
    }

    const updatedTenant = await this.tenantRepository.save(tenant);
    return this.toCompanyProfileResponseView(updatedTenant);
  }

  async findOneForUser(requester: AuthenticatedUser, id: string): Promise<User> {
    return this.accessScope.validateUserAccess(requester, id);
  }

  /**
   * Atualiza dados do usuário
   */
  async updateMe(requester: AuthenticatedUser, dto: UpdateMeDto): Promise<User> {
    const user = await this.loadUserOrFail(requester.id);
    const safeDto: UpdateMeDto = {
      email: dto.email,
      name: dto.name,
      password: dto.password,
    };

    return this.applyUserProfileUpdate(user, safeDto);
  }

  async updateForUser(
    requester: AuthenticatedUser,
    id: string,
    dto: AdminUpdateUserDto,
  ): Promise<User> {
    if ('password' in (dto as Record<string, unknown>)) {
      throw new ForbiddenException(
        'Use o endpoint dedicado para alteração administrativa de senha',
      );
    }

    const user = await this.findOneForUser(requester, id);
    this.assertManagerCanManageTargetUser(requester, user);

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
    requester: AuthenticatedUser,
    id: string,
    dto: ResetUserPasswordDto,
  ): Promise<User> {
    if (!(this.accessScope.isPlatformAdmin(requester) || this.accessScope.isAdmin(requester) || this.accessScope.isManager(requester))) {
      throw new ForbiddenException('Apenas PLATFORM_ADMIN, ADMIN ou MANAGER podem alterar a senha de usuários no próprio escopo');
    }

    const user = await this.findOneForUser(requester, id);
    this.assertManagerCanManageTargetUser(requester, user);
    if (this.accessScope.isManager(requester) && ![Role.OPERATIONAL, Role.CLIENT].includes(user.role)) {
      throw new ForbiddenException('MANAGER só pode alterar senha de OPERATIONAL ou CLIENT');
    }
    return this.applyUserProfileUpdate(user, { password: dto.password });
  }

  private async applyUserProfileUpdate(user: User, dto: UpdateMeDto): Promise<User> {
    let shouldInvalidateSession = false;

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
      user.refreshToken = null;
      user.sessionVersion = (user.sessionVersion ?? 0) + 1;
      shouldInvalidateSession = true;
    }

    const savedUser = await this.userRepository.save(user);
    if (shouldInvalidateSession) {
      return savedUser;
    }

    return savedUser;
  }

  /**
   * Delete (soft delete — marca como inativo)
   */
  async removeForUser(requester: AuthenticatedUser, id: string): Promise<void> {
    const user = await this.findOneForUser(requester, id);
    this.assertManagerCanManageTargetUser(requester, user);
    await this.ensureCanDeleteUser(user, requester);
    await this.softDeleteUser(user);
  }

  private async softDeleteUser(user: User): Promise<void> {
    await this.userStoreRepository.delete({ userId: user.id });
    user.active = false;
    user.refreshToken = null;
    user.sessionVersion = (user.sessionVersion ?? 0) + 1;
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

  private async resolveAccountType(tenantId?: string | null): Promise<AccountType | null> {
    return (await this.resolveTenantProfile(tenantId))?.accountType ?? null;
  }

  private async resolveTenantProfile(tenantId?: string | null): Promise<Pick<Tenant, 'accountType' | 'businessName' | 'businessSegment' | 'defaultCity' | 'defaultState' | 'website' | 'instagram' | 'whatsapp'> | null> {
    if (!tenantId) {
      return null;
    }

    return this.tenantRepository.findOne({
      where: { id: tenantId, deletedAt: IsNull() },
      select: ['id', 'accountType', 'businessName', 'businessSegment', 'defaultCity', 'defaultState', 'website', 'instagram', 'whatsapp'],
    });
  }

  private async resolveStoreId(
    userId: string,
    accountType?: AccountType | null,
  ): Promise<string | null> {
    if (accountType !== AccountType.INDIVIDUAL) {
      return null;
    }

    const userStore = await this.userStoreRepository.findOne({
      where: { userId },
      order: { createdAt: 'ASC' },
    });

    return userStore?.storeId ?? null;
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

  private assertManagerCanManageTargetUser(requester: AuthenticatedUser, user: User): void {
    if (!this.accessScope.isManager(requester)) {
      return;
    }

    if (user.id === requester.id) {
      return;
    }

    if (![Role.OPERATIONAL, Role.CLIENT].includes(user.role)) {
      throw new ForbiddenException('MANAGER só pode gerenciar usuários OPERATIONAL ou CLIENT');
    }
  }

  private async loadUserOrFail(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id, deletedAt: IsNull() } });
    if (!user) {
      throw new NotFoundException(`Usuário ${id} não encontrado`);
    }

    return user;
  }

  private async loadIndividualTenantForUser(requester: AuthenticatedUser): Promise<Tenant> {
    if (requester.accountType !== AccountType.INDIVIDUAL) {
      throw new ForbiddenException('Este endpoint está disponível apenas para contas INDIVIDUAL');
    }

    if (!requester.tenantId) {
      throw new ForbiddenException('Usuário sem tenant associado');
    }

    const tenant = await this.tenantRepository.findOne({
      where: { id: requester.tenantId, deletedAt: IsNull() },
    });

    if (!tenant || !tenant.active) {
      throw new NotFoundException('Empresa não encontrada');
    }

    this.accessScope.validateTenantAccess(requester, tenant.id);
    return tenant;
  }

  private toCompanyProfileResponseView(tenant: Pick<Tenant, 'businessName' | 'businessSegment' | 'defaultCity' | 'defaultState' | 'website' | 'instagram' | 'whatsapp'>): CompanyProfileResponseView {
    return {
      businessName: tenant.businessName ?? null,
      businessSegment: tenant.businessSegment ?? null,
      defaultCity: tenant.defaultCity ?? null,
      defaultState: tenant.defaultState ?? null,
      website: tenant.website ?? null,
      instagram: tenant.instagram ?? null,
      whatsapp: tenant.whatsapp ?? null,
    };
  }

  private cleanNullable(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeInstagram(value?: string | null): string | null {
    const normalized = this.cleanNullable(value);
    if (!normalized) {
      return null;
    }

    return normalized.startsWith('@') ? normalized : `@${normalized}`;
  }
}
