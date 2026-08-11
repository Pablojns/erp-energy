import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StockModule } from '../stock/stock.module';
import { CorreiosController } from './correios.controller';
import { CorreiosService } from './correios.service';
import { ReverseLogisticsService } from './reverse-logistics.service';

@Module({
  imports: [AuthModule, StockModule],
  controllers: [CorreiosController],
  providers: [CorreiosService, ReverseLogisticsService],
  exports: [CorreiosService], // disponível para OrderModule, etc.
})
export class CorreiosModule {}
