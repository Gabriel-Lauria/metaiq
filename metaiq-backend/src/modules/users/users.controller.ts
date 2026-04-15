import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { UsersService, UpdateUserDto } from './users.service';
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
  @Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)
  async getCurrentUser(@Request() req: AuthenticatedRequest): Promise<Omit<User, 'password'>> {
    const user = await this.usersService.findOne(req.user.id);
    const { password: _password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * PATCH /users/me
   * Atualiza dados do usuário autenticado
   */
  @Patch('me')
  @Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)
  async updateCurrentUser(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateUserDto,
  ): Promise<Omit<User, 'password'>> {
    const updated = await this.usersService.update(req.user.id, dto);
    const { password: _password, ...userWithoutPassword } = updated;
    return userWithoutPassword;
  }

  /**
   * DELETE /users/me
   * Desativa a conta do usuário
   */
  @Delete('me')
  @Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)
  async deleteCurrentUser(@Request() req: AuthenticatedRequest): Promise<{ message: string }> {
    await this.usersService.remove(req.user.id);
    this.logger.log(`Usuário ${req.user.email} deletou sua conta`);
    return { message: 'Conta deletada' };
  }

  /**
   * GET /users/:id (ADMIN ONLY)
   * Busca usuário por ID
   */
  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)
  async findOne(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<Omit<User, 'password'>> {
    // Só admin ou o próprio usuário pode ver
    if (![Role.ADMIN, Role.MANAGER].includes(req.user.role) && req.user.id !== id) {
      throw new ForbiddenException('Acesso negado');
    }

    const user = await this.usersService.findOneScoped(id, req.user);
    const { password: _password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * GET /users (ADMIN ONLY)
   * Lista todos os usuários
   */
  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  async findAll(@Request() req: AuthenticatedRequest): Promise<Omit<User, 'password'>[]> {
    const users = await this.usersService.findAllScoped(req.user);
    return users.map(({ password: _password, ...user }) => user);
  }
}
