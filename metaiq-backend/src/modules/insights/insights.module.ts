import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Insight } from './insight.entity';
import { InsightsService } from './insights.service';
import { InsightsController } from './insights.controller';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [TypeOrmModule.forFeature([Insight]), MetricsModule],
  providers: [InsightsService],
  controllers: [InsightsController],
  exports: [InsightsService],
})
export class InsightsModule {}
