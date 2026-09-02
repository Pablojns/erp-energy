import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditService } from '../common/audit.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { ComprasSeedService } from './compras-seed.service';
import { PurchaseRequestController } from './purchase-request.controller';
import { PurchaseRequestService } from './purchase-request.service';
import { PurchaseStageService } from './purchase-stage.service';

@Module({
  imports: [PrismaModule, AuthModule, StorageModule],
  controllers: [PurchaseRequestController],
  providers: [
    PurchaseRequestService,
    PurchaseStageService,
    ComprasSeedService,
    AuditService,
  ],
  exports: [PurchaseRequestService],
})
export class ComprasModule {}
