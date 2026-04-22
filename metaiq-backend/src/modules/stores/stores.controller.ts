import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
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
    const store = await this.storesService.create(req.user, dto);
    this.audit(req, 'store.create', store.id, 'store');
    return store;
  }

  @Get()
  findAll(@Request() req: any): Promise<Store[]> {
    return this.storesService.findAll(req.user);
  }

  @Get('accessible')
  @Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)
  findAccessible(@Request() req: any): Promise<Store[]> {
    return this.storesService.findAccessible(req.user);
  }

  @Get(':storeId/users')
  listUsers(
    @Param('storeId') storeId: string,
    @Request() req: any,
  ): Promise<Omit<User, 'password'>[]> {
    return this.storesService.listUsers(storeId, req.user);
  }

  @Post(':storeId/users/:userId')
  linkUser(
    @Param('storeId') storeId: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ): Promise<UserStore> {
    return this.storesService.linkUserToStore(storeId, userId, req.user).then((link) => {
      this.audit(req, 'store.user.link', storeId, 'store', { userId });
      return link;
    });
  }

  @Delete(':storeId/users/:userId')
  unlinkUser(
    @Param('storeId') storeId: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ): Promise<{ message: string }> {
    return this.storesService
      .unlinkUserFromStore(storeId, userId, req.user)
      .then(() => {
        this.audit(req, 'store.user.unlink', storeId, 'store', { userId });
        return { message: 'Vínculo removido' };
      });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any): Promise<Store> {
    return this.storesService.findOne(id, req.user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateStoreDto,
  ): Promise<Store> {
    return this.storesService.update(id, req.user, dto).then((store) => {
      this.audit(req, 'store.update', id, 'store');
      return store;
    });
  }

  @Patch(':id/toggle-active')
  toggleActive(@Param('id') id: string, @Request() req: any): Promise<Store> {
    return this.storesService.toggleActive(id, req.user).then((store) => {
      this.audit(req, 'store.toggle_active', id, 'store');
      return store;
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any): Promise<{ message: string }> {
    return this.storesService
      .remove(id, req.user)
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
