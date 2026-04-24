import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Post,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import {
  UsersService,
  UpdateMeDto,
  AdminUpdateUserDto,
  CreateUserDto,
  ResetUserPasswordDto,
  UserResponseView,
} from './users.service';
import { User } from './user.entity';
import { AuditService } from '../../common/services/audit.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * GET /users/me
   * Retorna dados do usuário autenticado
   */
  @Get('me')
  async getCurrentUser(@Request() req: any): Promise<UserResponseView> {
    const user = await this.usersService.findAuthenticatedProfile(req.user);
    return this.usersService.toUserResponseView(user);
  }

  /**
   * PATCH /users/me
   * Atualiza dados do usuário autenticado
   */
  @Patch('me')
  async updateCurrentUser(
    @Request() req: any,
    @Body() dto: UpdateMeDto,
  ): Promise<Omit<User, 'password'>> {
    const updated = await this.usersService.updateMe(req.user, dto);
    this.audit(req, 'user.self_update', updated.id, 'user', { changedFields: Object.keys(dto) });
    const { password: _password, ...userWithoutPassword } = updated;
    return userWithoutPassword;
  }

  /**
   * DELETE /users/me
   * Desativa a conta do usuário
   */
  @Delete('me')
  async deleteCurrentUser(@Request() req: any): Promise<{ message: string }> {
    await this.usersService.removeForUser(req.user, req.user.id);
    this.audit(req, 'user.self_delete', req.user.id, 'user');
    return { message: 'Conta deletada' };
  }

  /**
   * GET /users/:id
   * Busca usuário por ID
   */
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<Omit<User, 'password'>> {
    const user = await this.usersService.findOneForUser(req.user, id);
    const { password: _password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @Patch(':id')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER)
  async updateUser(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: AdminUpdateUserDto,
  ): Promise<Omit<User, 'password'>> {
    const updated = await this.usersService.updateForUser(req.user, id, dto);
    this.audit(req, 'user.update', updated.id, 'user', { changedFields: Object.keys(dto) });
    const { password: _password, ...userWithoutPassword } = updated;
    return userWithoutPassword;
  }

  @Patch(':id/password')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER)
  async resetUserPassword(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: ResetUserPasswordDto,
  ): Promise<Omit<User, 'password'>> {
    const updated = await this.usersService.resetPasswordAsAdmin(req.user, id, dto);
    this.audit(req, 'user.password_reset', updated.id, 'user');
    const { password: _password, ...userWithoutPassword } = updated;
    return userWithoutPassword;
  }

  @Post()
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER)
  async createUser(
    @Request() req: any,
    @Body() dto: CreateUserDto,
  ): Promise<Omit<User, 'password'>> {
    const created = await this.usersService.createForUser(req.user, dto);
    this.audit(req, 'user.create', created.id, 'user', { role: created.role });
    const { password: _password, ...userWithoutPassword } = created;
    return userWithoutPassword;
  }

  /**
   * GET /users (ADMIN/MANAGER)
   * Lista todos os usuários
   */
  @Get()
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER)
  async findAll(@Request() req: any): Promise<Omit<User, 'password'>[]> {
    const users = await this.usersService.findAllForUser(req.user);
    return users.map(({ password: _password, ...user }) => user);
  }

  @Delete(':id')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER)
  async deleteUser(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.usersService.removeForUser(req.user, id);
    this.audit(req, 'user.delete', id, 'user');
    return { message: 'Usuário excluído com segurança' };
  }

  private audit(
    req: any,
    action: string,
    targetId: string,
    targetType: string,
    metadata: Record<string, unknown> = {},
  ): void {
    this.auditService.record({
      action,
      status: 'success',
      actorId: req.user?.id,
      actorRole: req.user?.role,
      tenantId: req.user?.tenantId,
      targetType,
      targetId,
      requestId: req.requestId,
      metadata,
    });
  }
}
