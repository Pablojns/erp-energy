import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditService } from '../common/audit.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [StockController],
  providers: [StockService, AuditService],
})
export class StockModule {}
