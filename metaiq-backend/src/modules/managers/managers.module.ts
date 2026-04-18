import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Manager } from './manager.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Store } from '../stores/store.entity';
import { User } from '../users/user.entity';
import { UserStore } from '../user-stores/user-store.entity';
import { StoreIntegration } from '../integrations/store-integration.entity';
import { AdAccount } from '../ad-accounts/ad-account.entity';
import { Campaign } from '../campaigns/campaign.entity';
import { MetricDaily } from '../metrics/metric-daily.entity';
import { Insight } from '../insights/insight.entity';
import { ManagersController } from './managers.controller';
import { ManagersService } from './managers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Manager,
      Tenant,
      Store,
      User,
      UserStore,
      StoreIntegration,
      AdAccount,
      Campaign,
      MetricDaily,
      Insight,
    ]),
  ],
  controllers: [ManagersController],
  providers: [ManagersService],
  exports: [ManagersService],
})
export class ManagersModule {}
