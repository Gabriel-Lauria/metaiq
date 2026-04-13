import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtStrategy } from './auth/jwt.strategy';
import { User } from './modules/users/user.entity';
import { AdAccount } from './modules/meta/ad-account.entity';
import { Campaign } from './modules/campaigns/campaign.entity';
import { MetricDaily } from './modules/metrics/metric-daily.entity';
import { Insight } from './modules/insights/insight.entity';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { UsersModule } from './modules/users/users.module';
import { AdAccountsModule } from './modules/ad-accounts/ad-accounts.module';
import { InsightsModule } from './modules/insights/insights.module';
import { SyncCron } from './infrastructure/sync.cron';
import configuration, { Config } from './config/configuration';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    // ── Rate limiting com thresholds diferentes por endpoint ──────────────
    // auth/login: 5 requisições por minuto (proteção contra brute force)
    // auth/refresh: 10 requisições por minuto
    // geral: 20 requisições por minuto
    ThrottlerModule.forRoot([
      {
        name: 'auth',
        ttl: 60000, // 1 minuto
        limit: 5, // 5 tentativas de login por minuto
      },
      {
        name: 'refresh',
        ttl: 60000, // 1 minuto
        limit: 10, // 10 refresh por minuto (mais permissivo)
      },
      {
        name: 'general',
        ttl: 60000,
        limit: 20, // 20 requisições gerais por minuto
      },
    ]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<Config>('config').jwt.secret,
        signOptions: { expiresIn: config.get<Config>('config').jwt.expiresIn as any },
      }),
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbConfig = config.get<Config>('config').database;

        const baseConfig = {
          synchronize: true,
          logging: false,
          entities: [User, AdAccount, Campaign, MetricDaily, Insight],
        };

        if (dbConfig.type === 'postgres') {
          return {
            ...baseConfig,
            type: 'postgres',
            url: dbConfig.url,
            host: dbConfig.host,
            port: dbConfig.port,
            username: dbConfig.username,
            password: dbConfig.password,
            database: dbConfig.database,
            ssl: dbConfig.ssl,
          } as any;
        }

        return {
          ...baseConfig,
          type: 'sqlite',
          database: dbConfig.database,
        } as any;
      },
    }),
    TypeOrmModule.forFeature([User, AdAccount, Campaign, MetricDaily, Insight]),
    CampaignsModule,
    MetricsModule,
    UsersModule,
    AdAccountsModule,
    InsightsModule,
  ],
  controllers: [AppController, AuthController],
  providers: [JwtStrategy, AuthService, GlobalExceptionFilter, SyncCron],
})
export class AppModule {}
