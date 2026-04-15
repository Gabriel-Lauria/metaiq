import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { AdAccountsService } from './ad-accounts.service';
import { CreateAdAccountDto, UpdateAdAccountDto } from './dto/ad-account.dto';
import { AdAccount } from './ad-account.entity';

@Controller('ad-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
export class AdAccountsController {
  private readonly logger = new Logger(AdAccountsController.name);

  constructor(private readonly adAccountsService: AdAccountsService) {}

  @Get()
  async findByUser(@Request() req: AuthenticatedRequest): Promise<AdAccount[]> {
    return this.adAccountsService.findByUser(req.user);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<AdAccount> {
    return this.adAccountsService.findOne(id, req.user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  async create(
    @Body() dto: CreateAdAccountDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<AdAccount> {
    return this.adAccountsService.create(
      { ...dto, userId: req.user.id, storeId: dto.storeId ?? null },
      req.user,
    );
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAdAccountDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<AdAccount> {
    return this.adAccountsService.update(id, req.user, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  async remove(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.adAccountsService.remove(id, req.user);
    this.logger.log(`Conta de anuncios ${id} desativada por usuario ${req.user.id}`);
    return { message: 'Conta desativada' };
  }
}
