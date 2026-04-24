import { Controller, Get, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CurrentUser } from './common/decorators/current-user.decorator';

@Controller()
export class AppController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('/health')
  health() {
    return { status: 'ok' };
  }

  @Get('/live')
  live() {
    return { status: 'alive' };
  }

  @Get('/ready')
  async ready() {
    const checks = {
      database: {
        status: 'unknown',
        latencyMs: 0,
      },
    };

    if (!this.dataSource.isInitialized) {
      throw new ServiceUnavailableException({ status: 'not_ready' });
    }

    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ status: 'not_ready' });
    }

    void checks;
    return { status: 'ready' };
  }

  @Get('/api')
  api() {
    return {
      name: 'MetaIQ Backend API',
      status: 'ok',
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
