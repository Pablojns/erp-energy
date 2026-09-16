import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditService } from '../common/audit.service';
import { PermissionsModule } from '../common/permissions/permissions.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ExternalItemStockController } from './external-item-stock.controller';
import { ExternalItemsController } from './external-items.controller';
import { ExternalItemsService } from './external-items.service';

@Module({
  imports: [PrismaModule, AuthModule, PermissionsModule],
  controllers: [ExternalItemsController, ExternalItemStockController],
  providers: [ExternalItemsService, AuditService],
  exports: [ExternalItemsService],
})
export class ExternalItemsModule {}
