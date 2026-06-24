import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditService } from '../common/audit.service';
import { PermissionsModule } from '../common/permissions/permissions.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [PrismaModule, AuthModule, PermissionsModule],
  controllers: [StockController],
  providers: [StockService, AuditService],
  exports: [StockService],
})
export class StockModule {}
