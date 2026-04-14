import { Controller, Get, Post } from '@nestjs/common';
import { MetaService } from './meta.service';

@Controller('meta')
export class MetaController {
  constructor(private readonly metaService: MetaService) {}

  @Get('status')
  getStatus() {
    return this.metaService.getIntegrationStatus();
  }

  @Post('sync')
  async sync() {
    return this.metaService.syncAdAccounts();
  }
}
