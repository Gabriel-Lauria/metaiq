import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ManagersModule } from './modules/managers/managers.module';
import { StoresModule } from './modules/stores/stores.module';
import { AdAccountsModule } from './modules/ad-accounts/ad-accounts.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { CampaignAiModule } from './modules/ai/campaign-ai.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { InsightsModule } from './modules/insights/insights.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { MetaIntegrationModule } from './modules/integrations/meta/meta.module';
import { SyncCron } from './infrastructure/sync.cron';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import metaConfig from './config/meta.config';
import { User } from './modules/users/user.entity';
import { Manager } from './modules/managers/manager.entity';
import { Tenant } from './modules/tenants/tenant.entity';
import { Store } from './modules/stores/store.entity';
import { UserStore } from './modules/user-stores/user-store.entity';
import { AdAccount } from './modules/ad-accounts/ad-account.entity';
import { Campaign } from './modules/campaigns/campaign.entity';
import { MetricDaily } from './modules/metrics/metric-daily.entity';
import { Insight } from './modules/insights/insight.entity';
import { StoreIntegration } from './modules/integrations/store-integration.entity';
import { OAuthState } from './modules/integrations/oauth-state.entity';
import { MetaCampaignCreation } from './modules/integrations/meta/meta-campaign-creation.entity';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, metaConfig],
      envFilePath: '.env',
      expandVariables: true,
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          limit: 100,
          ttl: 60,
        },
      ],
    }),
    ScheduleModule.forRoot(),
    CommonModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbType = config.get<'sqlite' | 'postgres'>('database.type') || 'postgres';
        const appEnv = config.get<string>('app.nodeEnv');

        const baseConfig = {
          synchronize: config.get<boolean>('database.synchronize'),
          logging: appEnv !== 'production' && appEnv !== 'test',
          entities: [User, Manager, Tenant, Store, UserStore, AdAccount, Campaign, MetricDaily, Insight, StoreIntegration, OAuthState, MetaCampaignCreation],
          migrations: [__dirname + '/migrations/*{.ts,.js}'],
          migrationsRun: config.get<boolean>('database.migrationsRun'),
        } as any;

        if (dbType === 'postgres') {
          const url = config.get<string>('database.url');
          return {
            ...baseConfig,
            type: 'postgres',
            ...(url
              ? { url }
              : {
                  host: config.get<string>('database.host'),
                  port: config.get<number>('database.port'),
                  username: config.get<string>('database.username'),
                  password: config.get<string>('database.password'),
                  database: config.get<string>('database.database'),
                }),
            ssl: config.get<any>('database.ssl'),
          };
        }

        return {
          ...baseConfig,
          type: 'sqlite',
          database: config.get<string>('database.database') || './data/metaiq.db',
        };
      },
    }),
    AuthModule,
    UsersModule,
    ManagersModule,
    StoresModule,
    AdAccountsModule,
    CampaignsModule,
    CampaignAiModule,
    MetricsModule,
    InsightsModule,
    DashboardModule,
    MetaIntegrationModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    SyncCron,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
