import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditService } from '../common/audit.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StockModule } from '../stock/stock.module';
import { OrderController } from './order.controller';
import { OrderImportService } from './order-import.service';
import { OrderService } from './order.service';
import { CarrierResolverService } from './carrier-resolver.service';
import { NfAutomaticoService } from './nf-automatico.service';
import { NfQueueService } from './nf-queue.service';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';

@Module({
  imports: [PrismaModule, AuthModule, StockModule],
  controllers: [OrderController, PedidosController],
  providers: [
    OrderService,
    CarrierResolverService,
    OrderImportService,
    PedidosService,
    NfAutomaticoService,
    NfQueueService,
    AuditService,
  ],
  exports: [PedidosService, NfAutomaticoService, NfQueueService],
})
export class OrderModule {}
