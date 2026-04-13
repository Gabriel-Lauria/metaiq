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
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdAccountsService, CreateAdAccountDto, UpdateAdAccountDto } from './ad-accounts.service';
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
  async findByUser(@Request() req: any): Promise<AdAccount[]> {
    return this.adAccountsService.findByUser(req.user.sub);
  }

  /**
   * GET /ad-accounts/:id
   * Busca uma conta específica
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<AdAccount> {
    return this.adAccountsService.findOne(id);
  }

  /**
   * POST /ad-accounts
   * Cria uma nova conta de anúncios
   */
  @Post()
  async create(
    @Body() dto: CreateAdAccountDto,
    @Request() req: any,
  ): Promise<AdAccount> {
    dto.userId = req.user.sub; // Garante que pertence ao usuário autenticado
    return this.adAccountsService.create(dto);
  }

  /**
   * PATCH /ad-accounts/:id
   * Atualiza dados da conta
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAdAccountDto,
  ): Promise<AdAccount> {
    return this.adAccountsService.update(id, dto);
  }

  /**
   * DELETE /ad-accounts/:id
   * Desativa a conta
   */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    await this.adAccountsService.remove(id);
    this.logger.log(`Conta de anúncios ${id} desativada`);
    return { message: 'Conta desativada' };
  }
}
