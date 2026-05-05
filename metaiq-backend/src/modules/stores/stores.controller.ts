import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { CheckOwnership } from '../../common/decorators/check-ownership.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OwnershipGuard } from '../../common/guards/ownership.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { User } from '../users/user.entity';
import { UserStore } from '../user-stores/user-store.entity';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';
import { Store } from './store.entity';
import { StoresService } from './stores.service';
import { AuditService } from '../../common/services/audit.service';

@Controller('stores')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER)
export class StoresController {
  constructor(
    private readonly storesService: StoresService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  async create(@Request() req: any, @Body() dto: CreateStoreDto): Promise<Store> {
    const store = await this.storesService.createForUser(req.user, dto);
    this.audit(req, 'store.create', store.id, 'store');
    return store;
  }

  @Get()
  findAll(@Request() req: any): Promise<Store[]> {
    return this.storesService.findAllForUser(req.user);
  }

  @Get('accessible')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
  findAccessible(@Request() req: any): Promise<Store[]> {
    return this.storesService.findAccessibleForUser(req.user);
  }

  @Get(':storeId/users')
  @CheckOwnership('store', 'storeId')
  @UseGuards(OwnershipGuard)
  listUsers(
    @Param('storeId') storeId: string,
    @Request() req: any,
  ): Promise<Omit<User, 'password'>[]> {
    return this.storesService.listUsersForUser(req.user, storeId);
  }

  @Post(':storeId/users/:userId')
  @CheckOwnership('store', 'storeId')
  @UseGuards(OwnershipGuard)
  linkUser(
    @Param('storeId') storeId: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ): Promise<UserStore> {
    return this.storesService.linkUserToStoreForUser(req.user, storeId, userId).then((link) => {
      this.audit(req, 'store.user.link', storeId, 'store', { userId });
      return link;
    });
  }

  @Delete(':storeId/users/:userId')
  @CheckOwnership('store', 'storeId')
  @UseGuards(OwnershipGuard)
  unlinkUser(
    @Param('storeId') storeId: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ): Promise<{ message: string }> {
    return this.storesService
      .unlinkUserFromStoreForUser(req.user, storeId, userId)
      .then(() => {
        this.audit(req, 'store.user.unlink', storeId, 'store', { userId });
        return { message: 'Vínculo removido' };
      });
  }

  @Get(':id')
  @CheckOwnership('store', 'id')
  @UseGuards(OwnershipGuard)
  findOne(@Param('id') id: string, @Request() req: any): Promise<Store> {
    return this.storesService.findOneForUser(req.user, id);
  }

  @Patch(':id')
  @CheckOwnership('store', 'id')
  @UseGuards(OwnershipGuard)
  update(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateStoreDto,
  ): Promise<Store> {
    return this.storesService.updateForUser(req.user, id, dto).then((store) => {
      this.audit(req, 'store.update', id, 'store');
      return store;
    });
  }

  @Patch(':id/toggle-active')
  @CheckOwnership('store', 'id')
  @UseGuards(OwnershipGuard)
  toggleActive(@Param('id') id: string, @Request() req: any): Promise<Store> {
    return this.storesService.toggleActiveForUser(req.user, id).then((store) => {
      this.audit(req, 'store.toggle_active', id, 'store');
      return store;
    });
  }

  @Delete(':id')
  @CheckOwnership('store', 'id')
  @UseGuards(OwnershipGuard)
  remove(@Param('id') id: string, @Request() req: any): Promise<{ message: string }> {
    return this.storesService
      .removeForUser(req.user, id)
      .then(() => {
        this.audit(req, 'store.delete', id, 'store');
        return { message: 'Loja excluída com segurança' };
      });
  }

  private audit(
    req: any,
    action: string,
    targetId: string,
    targetType: string,
    metadata?: Record<string, unknown>,
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
