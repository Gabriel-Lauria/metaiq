import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OwnershipGuard } from '../../common/guards/ownership.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CheckOwnership } from '../../common/decorators/check-ownership.decorator';
import { Role } from '../../common/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdAccountsService } from './ad-accounts.service';
import { CreateAdAccountDto, UpdateAdAccountDto } from './dto/ad-account.dto';
import { AdAccount } from './ad-account.entity';
import { AuthenticatedUser } from '../../common/interfaces';

@Controller('ad-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdAccountsController {
  private readonly logger = new Logger(AdAccountsController.name);

  constructor(private readonly adAccountsService: AdAccountsService) {}

  /**
   * GET /ad-accounts
   * Lista todas as contas do usuário
   */
  @Get()
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
  async findByUser(
    @CurrentUser() user: AuthenticatedUser,
    @Query('storeId') storeId?: string,
  ): Promise<AdAccount[]> {
    return this.adAccountsService.findByUser(user, storeId);
  }

  /**
   * GET /ad-accounts/:id
   * Busca uma conta específica (com validação de ownership)
   */
  @Get(':id')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
  @CheckOwnership('adAccount', 'id')
  @UseGuards(OwnershipGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdAccount> {
    return this.adAccountsService.findOne(id, user);
  }

  /**
   * POST /ad-accounts
   * Cria uma nova conta de anúncios
   */
  @Post()
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER)
  async create(
    @Body() dto: CreateAdAccountDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdAccount> {
    return this.adAccountsService.create(dto, user);
  }

  /**
   * PATCH /ad-accounts/:id
   * Atualiza dados da conta
   */
  @Patch(':id')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER)
  @CheckOwnership('adAccount', 'id')
  @UseGuards(OwnershipGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAdAccountDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdAccount> {
    return this.adAccountsService.update(id, user, dto);
  }

  /**
   * DELETE /ad-accounts/:id
   * Desativa a conta
   */
  @Delete(':id')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER)
  @CheckOwnership('adAccount', 'id')
  @UseGuards(OwnershipGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    await this.adAccountsService.remove(id, user);
    this.logger.log(`Conta de anúncios ${id} desativada por usuário ${user.id}`);
    return { message: 'Conta desativada' };
  }
}
