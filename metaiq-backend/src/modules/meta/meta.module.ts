import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';

@Module({
  imports: [ConfigModule],
  controllers: [MetaController],
  providers: [MetaService],
  exports: [MetaService],
})
export class MetaModule {}
