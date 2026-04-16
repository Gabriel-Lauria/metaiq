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
  Logger,
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
} from './users.service';
import { User } from './user.entity';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/me
   * Retorna dados do usuário autenticado
   */
  @Get('me')
  async getCurrentUser(@Request() req: any): Promise<Omit<User, 'password'>> {
    const user = await this.usersService.findAuthenticatedProfile(req.user);
    const { password: _password, ...userWithoutPassword } = user;
    return userWithoutPassword;
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
    const updated = await this.usersService.updateMe(req.user.id, dto);
    const { password: _password, ...userWithoutPassword } = updated;
    return userWithoutPassword;
  }

  /**
   * DELETE /users/me
   * Desativa a conta do usuário
   */
  @Delete('me')
  async deleteCurrentUser(@Request() req: any): Promise<{ message: string }> {
    await this.usersService.remove(req.user.id);
    this.logger.log(`Usuário ${req.user.email} deletou sua conta`);
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
    const user = await this.usersService.findOneForUser(id, req.user);
    const { password: _password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  async updateUser(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: AdminUpdateUserDto,
  ): Promise<Omit<User, 'password'>> {
    const updated = await this.usersService.updateForUser(id, req.user, dto);
    const { password: _password, ...userWithoutPassword } = updated;
    return userWithoutPassword;
  }

  @Patch(':id/password')
  @Roles(Role.ADMIN)
  async resetUserPassword(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: ResetUserPasswordDto,
  ): Promise<Omit<User, 'password'>> {
    const updated = await this.usersService.resetPasswordAsAdmin(id, req.user, dto);
    const { password: _password, ...userWithoutPassword } = updated;
    return userWithoutPassword;
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  async createUser(
    @Request() req: any,
    @Body() dto: CreateUserDto,
  ): Promise<Omit<User, 'password'>> {
    const created = await this.usersService.createForUser(req.user, dto);
    const { password: _password, ...userWithoutPassword } = created;
    return userWithoutPassword;
  }

  /**
   * GET /users (ADMIN/MANAGER)
   * Lista todos os usuários
   */
  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  async findAll(@Request() req: any): Promise<Omit<User, 'password'>[]> {
    const users = await this.usersService.findAllForUser(req.user);
    return users.map(({ password: _password, ...user }) => user);
  }
}
