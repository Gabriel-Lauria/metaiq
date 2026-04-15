import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { Manager } from '../managers/manager.entity';
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
    private readonly accessScope: AccessScopeService,
  ) {}

  /**
   * Cria um novo usuário com senha hasheada
   */
  async create(dto: CreateUserDto): Promise<User> {
    return this.createUserWithResolvedScope(dto);
  }

  async createForUser(requester: AuthenticatedUser, dto: CreateUserDto): Promise<User> {
    if (this.accessScope.isAdmin(requester)) {
      return this.createUserWithResolvedScope(dto);
    }

    if (!this.accessScope.isManager(requester) || !requester.managerId) {
      throw new ForbiddenException('Apenas ADMIN ou MANAGER podem criar usuários');
    }

    const role = dto.role ?? Role.OPERATIONAL;
    if (![Role.OPERATIONAL, Role.CLIENT].includes(role)) {
      throw new ForbiddenException('MANAGER só pode criar usuários OPERATIONAL ou CLIENT');
    }

    return this.createUserWithResolvedScope({
      ...dto,
      role,
      managerId: requester.managerId,
    });
  }

  /**
   * Busca usuário por email (para login)
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  /**
   * Busca usuário por ID
   */
  async findOneUnsafeInternal(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuário ${id} não encontrado`);
    }
    return user;
  }

  /**
   * Lista todos os usuários (admin/manager)
   */
  async findAllUnsafeInternal(): Promise<User[]> {
    return this.userRepository.find();
  }

  async findAllForUser(requester: AuthenticatedUser): Promise<User[]> {
    if (this.accessScope.isAdmin(requester)) {
      return this.userRepository.find();
    }

    if (this.accessScope.isManager(requester)) {
      if (!requester.managerId) {
        return [];
      }

      return this.userRepository.find({
        where: { managerId: requester.managerId },
      });
    }

    return this.userRepository.find({
      where: { id: requester.id },
    });
  }

  async findOneForUser(id: string, requester: AuthenticatedUser): Promise<User> {
    const user = await this.findOneUnsafeInternal(id);

    if (this.accessScope.isAdmin(requester) || requester.id === id) {
      return user;
    }

    if (this.accessScope.isManager(requester)) {
      this.accessScope.validateTenantAccess(requester, user.managerId);
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
      if (!this.accessScope.isAdmin(requester)) {
        throw new ForbiddenException('Apenas ADMIN pode alterar managerId');
      }

      if (requester.id === user.id) {
        throw new ForbiddenException('Usuário não pode alterar o próprio tenant');
      }

      user.managerId = dto.managerId;
    }

    return this.applyUserProfileUpdate(user, dto);
  }

  async resetPasswordAsAdmin(
    id: string,
    requester: AuthenticatedUser,
    dto: ResetUserPasswordDto,
  ): Promise<User> {
    if (!this.accessScope.isAdmin(requester)) {
      throw new ForbiddenException('Apenas ADMIN pode alterar a senha de qualquer usuário');
    }

    const user = await this.findOneUnsafeInternal(id);
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
    user.active = false;
    await this.userRepository.save(user);
  }

  /**
   * Valida credenciais (para login)
   */
  async validatePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  private async createUserWithResolvedScope(dto: CreateUserDto): Promise<User> {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email já cadastrado');
    }

    const role = dto.role ?? Role.OPERATIONAL;
    const managerId = role === Role.ADMIN ? null : dto.managerId ?? null;

    if (role !== Role.ADMIN && !managerId) {
      throw new BadRequestException('managerId é obrigatório para usuário não-admin');
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
      active: dto.active ?? true,
    });

    return this.userRepository.save(user);
  }
}
