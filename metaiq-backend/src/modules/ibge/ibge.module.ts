import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CommonModule } from '../../common/common.module';
import { IbgeController } from './ibge.controller';
import { IbgeService } from './ibge.service';

@Module({
  imports: [CommonModule, HttpModule],
  controllers: [IbgeController],
  providers: [IbgeService],
  exports: [IbgeService],
})
export class IbgeModule {}
