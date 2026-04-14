import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CurrentUser } from './common/decorators/current-user.decorator';

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
  protected(@CurrentUser() user: any) {
    return {
      message: 'Acesso autorizado!',
      user,
      timestamp: new Date().toISOString(),
    };
  }
}
