import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CorreiosModule } from '../correios/correios.module';
import { AuditService } from '../common/audit.service';
import { PermissionsModule } from '../common/permissions/permissions.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StockModule } from '../stock/stock.module';
import { OrderController } from './order.controller';
import { OrderImportService } from './order-import.service';
import { PedidosImportController } from './pedidos-import.controller';
import { ImportApiKeyGuard } from './import-api-key.guard';
import { OrderService } from './order.service';
import { CarrierResolverService } from './carrier-resolver.service';
import { NfAutomaticoService } from './nf-automatico.service';
import { NfLoteService } from './nf-lote.service';
import { NfQueueService } from './nf-queue.service';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';
import { PedidosEtiquetaService } from './pedidos-etiqueta.service';

@Module({
  imports: [PrismaModule, AuthModule, StockModule, PermissionsModule, CorreiosModule],
  controllers: [OrderController, PedidosController, PedidosImportController],
  providers: [
    OrderService,
    CarrierResolverService,
    OrderImportService,
    ImportApiKeyGuard,
    PedidosService,
    PedidosEtiquetaService,
    NfAutomaticoService,
    NfQueueService,
    NfLoteService,
    AuditService,
  ],
  exports: [PedidosService, NfAutomaticoService, NfQueueService, NfLoteService],
})
export class OrderModule {}
