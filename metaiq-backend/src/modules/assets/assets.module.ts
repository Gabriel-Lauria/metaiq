import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { Store } from '../stores/store.entity';
import { User } from '../users/user.entity';
import { Asset } from './entities/asset.entity';
import { AssetContentController, AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
  imports: [CommonModule, TypeOrmModule.forFeature([Asset, Store, User])],
  controllers: [AssetsController, AssetContentController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
