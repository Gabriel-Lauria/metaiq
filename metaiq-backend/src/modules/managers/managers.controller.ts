import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { Manager } from './manager.entity';
import { ManagersService } from './managers.service';
import { CreateManagerDto, UpdateManagerDto } from './dto/manager.dto';

@Controller('managers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PLATFORM_ADMIN)
export class ManagersController {
  constructor(private readonly managersService: ManagersService) {}

  @Post()
  create(@Body() dto: CreateManagerDto): Promise<Manager> {
    return this.managersService.create(dto);
  }

  @Get()
  findAll(@Request() req: any): Promise<Manager[]> {
    return this.managersService.findAllForUser(req.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Manager> {
    return this.managersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateManagerDto): Promise<Manager> {
    return this.managersService.update(id, dto);
  }

  @Patch(':id/toggle-active')
  toggleActive(@Param('id') id: string): Promise<Manager> {
    return this.managersService.toggleActive(id);
  }

  @Delete(':id')
  @Roles(Role.PLATFORM_ADMIN)
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    await this.managersService.remove(id);
    return { message: 'Empresa excluída com segurança' };
  }
}
