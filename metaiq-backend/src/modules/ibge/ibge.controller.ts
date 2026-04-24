import { Controller, Get, Param } from '@nestjs/common';
import { IbgeCityDto, IbgeService, IbgeStateDto } from './ibge.service';

@Controller('ibge')
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
