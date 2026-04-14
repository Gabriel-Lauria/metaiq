import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdAccountsService } from './ad-accounts.service';
import { CreateAdAccountDto, UpdateAdAccountDto } from './dto/ad-account.dto';
import { AdAccount } from './ad-account.entity';

@Controller('ad-accounts')
@UseGuards(JwtAuthGuard)
export class AdAccountsController {
  private readonly logger = new Logger(AdAccountsController.name);

  constructor(private readonly adAccountsService: AdAccountsService) {}

  /**
   * GET /ad-accounts
   * Lista todas as contas do usuário
   */
  @Get()
  async findByUser(@CurrentUser() userId: string): Promise<AdAccount[]> {
    return this.adAccountsService.findByUser(userId);
  }

  /**
   * GET /ad-accounts/:id
   * Busca uma conta específica (com validação de ownership)
   */
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ): Promise<AdAccount> {
    return this.adAccountsService.findOne(id, userId);
  }

  /**
   * POST /ad-accounts
   * Cria uma nova conta de anúncios
   */
  @Post()
  async create(
    @Body() dto: CreateAdAccountDto,
    @CurrentUser() userId: string,
  ): Promise<AdAccount> {
    return this.adAccountsService.create({ ...dto, userId });
  }

  /**
   * PATCH /ad-accounts/:id
   * Atualiza dados da conta
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAdAccountDto,
    @CurrentUser() userId: string,
  ): Promise<AdAccount> {
    return this.adAccountsService.update(id, userId, dto);
  }

  /**
   * DELETE /ad-accounts/:id
   * Desativa a conta
   */
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ): Promise<{ message: string }> {
    await this.adAccountsService.remove(id, userId);
    this.logger.log(`Conta de anúncios ${id} desativada por usuário ${userId}`);
    return { message: 'Conta desativada' };
  }
}
