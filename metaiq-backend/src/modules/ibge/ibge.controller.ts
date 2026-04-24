import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { IbgeCityDto, IbgeService, IbgeStateDto } from './ibge.service';

@Controller('ibge')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)
export class IbgeController {
  constructor(private readonly ibgeService: IbgeService) {}

  @Get('states')
  async getStates(): Promise<IbgeStateDto[]> {
    return this.ibgeService.getStates();
  }

  @Get('states/:uf/cities')
  async getCities(@Param('uf') ufParam: string): Promise<IbgeCityDto[]> {
    return this.ibgeService.getCitiesByUf(ufParam);
  }
}
