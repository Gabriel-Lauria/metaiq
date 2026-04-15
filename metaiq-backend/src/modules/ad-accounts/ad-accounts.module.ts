import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdAccount } from './ad-account.entity';
import { AdAccountsService } from './ad-accounts.service';
import { AdAccountsController } from './ad-accounts.controller';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [CommonModule, TypeOrmModule.forFeature([AdAccount])],
  providers: [AdAccountsService],
  controllers: [AdAccountsController],
  exports: [AdAccountsService],
})
export class AdAccountsModule {}
