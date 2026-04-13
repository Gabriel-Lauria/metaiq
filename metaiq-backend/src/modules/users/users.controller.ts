import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { UsersService, CreateUserDto, UpdateUserDto } from './users.service';
import { User } from './user.entity';

@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/me
   * Retorna dados do usuário autenticado
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@Request() req: any): Promise<Omit<User, 'password'>> {
    const user = await this.usersService.findOne(req.user.sub);
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * PATCH /users/me
   * Atualiza dados do usuário autenticado
   */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateCurrentUser(
    @Request() req: any,
    @Body() dto: UpdateUserDto,
  ): Promise<Omit<User, 'password'>> {
    const updated = await this.usersService.update(req.user.sub, dto);
    const { password, ...userWithoutPassword } = updated;
    return userWithoutPassword;
  }

  /**
   * DELETE /users/me
   * Desativa a conta do usuário
   */
  @Delete('me')
  @UseGuards(JwtAuthGuard)
  async deleteCurrentUser(@Request() req: any): Promise<{ message: string }> {
    await this.usersService.remove(req.user.sub);
    this.logger.log(`Usuário ${req.user.email} deletou sua conta`);
    return { message: 'Conta deletada' };
  }

  /**
   * GET /users/:id (ADMIN ONLY)
   * Busca usuário por ID
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<Omit<User, 'password'>> {
    // Só admin ou o próprio usuário pode ver
    if (req.user.sub !== id) {
      throw new ForbiddenException('Acesso negado');
    }

    const user = await this.usersService.findOne(id);
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * GET /users (ADMIN ONLY)
   * Lista todos os usuários
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(): Promise<Omit<User, 'password'>[]> {
    const users = await this.usersService.findAll();
    return users.map(({ password, ...user }) => user);
  }
}
