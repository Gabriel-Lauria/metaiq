import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { IntegrationProvider } from './common/enums';

@Controller()
export class AppController {
  private readonly metricsSyncMaxAgeMs = 24 * 60 * 60 * 1000;

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  @Get('/health')
  async health() {
    const checks = await this.runChecks(false);
    return {
      status: this.deriveHealthStatus(checks),
      checks,
    };
  }

  @Get('/live')
  live() {
    return { status: 'alive' };
  }

  @Get('/ready')
  async ready() {
    const checks = await this.runChecks(true);
    const status = this.deriveReadinessStatus(checks);

    if (status === 'not_ready') {
      throw new ServiceUnavailableException({
        status,
        checks,
      });
    }

    return {
      status,
      checks,
    };
  }

  @Get('/api')
  api() {
    return {
      name: 'Nexora Backend API',
      status: 'ok',
    };
  }

  private async runChecks(includeDatabase: boolean) {
    const checks = {
      database: {
        status: 'unknown',
        latencyMs: 0,
      },
      crypto: {
        status: this.isCryptoConfigured() ? 'ok' : 'not_ready',
      },
      meta: {
        status: this.isMetaMinimallyConfigured() ? 'ok' : 'degraded',
      },
      metricsSync: {
        status: 'unknown',
        lastSyncAt: null as string | null,
        metricRows: 0,
      },
    };

    if (includeDatabase) {
      const startedAt = Date.now();
      if (!this.dataSource.isInitialized) {
        checks.database.status = 'not_ready';
      } else {
        try {
          await this.dataSource.query('SELECT 1');
          checks.database.status = 'ok';
          checks.database.latencyMs = Date.now() - startedAt;
        } catch {
          checks.database.status = 'not_ready';
          checks.database.latencyMs = Date.now() - startedAt;
        }
      }

      if (checks.database.status === 'ok') {
        const metricsSync = await this.loadMetricsSyncState();
        checks.metricsSync.status = metricsSync.status;
        checks.metricsSync.lastSyncAt = metricsSync.lastSyncAt;
        checks.metricsSync.metricRows = metricsSync.metricRows;
      }
    }

    return checks;
  }

  private deriveHealthStatus(checks: {
    database: { status: string };
    crypto: { status: string };
    meta: { status: string };
    metricsSync: { status: string };
  }): 'ok' | 'degraded' {
    if (checks.crypto.status !== 'ok') {
      return 'degraded';
    }

    if (checks.meta.status !== 'ok' || checks.metricsSync.status === 'degraded') {
      return 'degraded';
    }

    return 'ok';
  }

  private deriveReadinessStatus(checks: {
    database: { status: string };
    crypto: { status: string };
    meta: { status: string };
    metricsSync: { status: string };
  }): 'ok' | 'degraded' | 'not_ready' {
    if (checks.database.status !== 'ok' || checks.crypto.status !== 'ok') {
      return 'not_ready';
    }

    if (checks.meta.status !== 'ok' || checks.metricsSync.status !== 'ok') {
      return 'degraded';
    }

    return 'ok';
  }

  private isCryptoConfigured(): boolean {
    const secret = this.config.get<string>('app.cryptoSecret')?.trim() || '';
    return Boolean(secret && secret !== 'replace-with-a-secure-secret');
  }

  private isMetaMinimallyConfigured(): boolean {
    const appId = this.config.get<string>('meta.appId')?.trim() || '';
    const appSecret = this.config.get<string>('meta.appSecret')?.trim() || '';
    const redirectUri = this.config.get<string>('meta.redirectUri')?.trim() || '';
    return Boolean(appId && appSecret && redirectUri);
  }

  private async loadMetricsSyncState(): Promise<{
    status: 'ok' | 'degraded';
    lastSyncAt: string | null;
    metricRows: number;
  }> {
    const metricRowsRaw = await this.dataSource
      .createQueryBuilder()
      .from('metrics_daily', 'metric')
      .select('COUNT(*)', 'count')
      .getRawOne<{ count?: string | number }>();
    const metricRows = Number(metricRowsRaw?.count || 0);

    const syncRaw = await this.dataSource
      .createQueryBuilder()
      .from('store_integrations', 'integration')
      .select('MAX(integration.lastSyncAt)', 'lastSyncAt')
      .where('integration.provider = :provider', {
        provider: IntegrationProvider.META,
      })
      .getRawOne<{ lastSyncAt?: string | Date | null }>();
    const lastSyncAtRaw = syncRaw?.lastSyncAt ?? null;
    const lastSyncAt = lastSyncAtRaw ? new Date(lastSyncAtRaw) : null;
    const isFresh = lastSyncAt && (Date.now() - lastSyncAt.getTime()) <= this.metricsSyncMaxAgeMs;

    return {
      status: metricRows > 0 && Boolean(isFresh) ? 'ok' : 'degraded',
      lastSyncAt: lastSyncAt ? lastSyncAt.toISOString() : null,
      metricRows,
    };
  }
}
