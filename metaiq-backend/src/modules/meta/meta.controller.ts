import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MetaService } from './meta.service';

@Controller('meta')
@UseGuards(JwtAuthGuard)
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
