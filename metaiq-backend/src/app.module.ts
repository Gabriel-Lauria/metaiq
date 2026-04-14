import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AdAccountsModule } from './modules/ad-accounts/ad-accounts.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { InsightsModule } from './modules/insights/insights.module';
import { MetaModule } from './modules/meta/meta.module';
import { SyncCron } from './infrastructure/sync.cron';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import { User } from './modules/users/user.entity';
import { AdAccount } from './modules/ad-accounts/ad-account.entity';
import { Campaign } from './modules/campaigns/campaign.entity';
import { MetricDaily } from './modules/metrics/metric-daily.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig],
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
        const dbType = config.get<'sqlite' | 'postgres'>('database.type');
        const appEnv = config.get<string>('app.nodeEnv');

        const baseConfig = {
          synchronize: appEnv !== 'production',
          logging: appEnv !== 'production',
          entities: [User, AdAccount, Campaign, MetricDaily],
        } as any;

        if (dbType === 'postgres') {
          return {
            ...baseConfig,
            type: 'postgres',
            host: config.get<string>('database.host'),
            port: config.get<number>('database.port'),
            username: config.get<string>('database.username'),
            password: config.get<string>('database.password'),
            database: config.get<string>('database.database'),
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
    AdAccountsModule,
    CampaignsModule,
    MetricsModule,
    InsightsModule,
    MetaModule,
  ],
  controllers: [AppController],
  providers: [GlobalExceptionFilter, SyncCron],
})
export class AppModule {}
