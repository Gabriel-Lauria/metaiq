import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@Controller()
export class AppController {
  @Get('/health')
  health() {
    return {
      status: 'ok',
      db: 'postgresql',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('/api')
  api() {
    return {
      message: 'MetaIQ Backend API',
      version: '1.0.0',
      endpoints: ['/api/health', '/api/campaigns', '/api/metrics', '/api/auth'],
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('/protected')
  protected() {
    return {
      message: 'Acesso autorizado!',
      timestamp: new Date().toISOString(),
    };
  }
}
