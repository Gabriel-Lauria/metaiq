import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { Manager } from './manager.entity';
import { ManagersService } from './managers.service';
import { CreateManagerDto, UpdateManagerDto } from './dto/manager.dto';
import { AuditService } from '../../common/services/audit.service';

@Controller('managers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PLATFORM_ADMIN)
export class ManagersController {
  constructor(
    private readonly managersService: ManagersService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  async create(@Request() req: any, @Body() dto: CreateManagerDto): Promise<Manager> {
    const manager = await this.managersService.create(dto);
    this.audit(req, 'manager.create', manager.id, 'success');
    return manager;
  }

  @Get()
  findAll(@Request() req: any): Promise<Manager[]> {
    this.audit(req, 'manager.list.global', null, 'success');
    return this.managersService.findAllForUser(req.user);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: any): Promise<Manager> {
    const manager = await this.managersService.findOne(id);
    this.audit(req, 'manager.read.global', id, 'success');
    return manager;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Request() req: any, @Body() dto: UpdateManagerDto): Promise<Manager> {
    const manager = await this.managersService.update(id, dto);
    this.audit(req, 'manager.update', id, 'success');
    return manager;
  }

  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string, @Request() req: any): Promise<Manager> {
    const manager = await this.managersService.toggleActive(id);
    this.audit(req, 'manager.toggle_active', id, 'success');
    return manager;
  }

  @Delete(':id')
  @Roles(Role.PLATFORM_ADMIN)
  async remove(@Param('id') id: string, @Request() req: any): Promise<{ message: string }> {
    await this.managersService.remove(id);
    this.audit(req, 'manager.delete', id, 'success');
    return { message: 'Empresa excluída com segurança' };
  }

  private audit(req: any, action: string, targetId: string | null, status: 'success' | 'failure'): void {
    this.auditService.record({
      action,
      status,
      actorId: req.user?.id,
      actorRole: req.user?.role,
      tenantId: req.user?.tenantId,
      targetType: 'manager',
      targetId,
      requestId: req.requestId,
    });
  }
}
