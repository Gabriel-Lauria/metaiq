import { Controller, Get, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CurrentUser } from './common/decorators/current-user.decorator';

@Controller()
export class AppController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  @Get('/health')
  health() {
    return {
      status: 'ok',
      service: 'metaiq-backend',
      environment: this.configService.get<string>('app.nodeEnv'),
      db: this.configService.get<string>('database.type'),
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('/ready')
  async ready() {
    if (!this.dataSource.isInitialized) {
      throw new ServiceUnavailableException('Database connection is not initialized');
    }

    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('Database readiness check failed');
    }

    return {
      status: 'ready',
      db: this.configService.get<string>('database.type'),
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
