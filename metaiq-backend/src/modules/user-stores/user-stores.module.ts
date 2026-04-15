import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserStore } from './user-store.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserStore])],
  exports: [TypeOrmModule],
})
export class UserStoresModule {}
