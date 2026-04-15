import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { Campaign } from '../campaigns/campaign.entity';
import { Insight } from '../insights/insight.entity';
import { MetricDaily } from '../metrics/metric-daily.entity';
import { Store } from '../stores/store.entity';
import { User } from '../users/user.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [CommonModule, TypeOrmModule.forFeature([Campaign, MetricDaily, Insight, Store, User])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
