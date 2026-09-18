import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { ExternalItemsModule } from '../external-items/external-items.module';
import { QuotesModule } from '../quotes/quotes.module';
import { ContaAzulController } from './conta-azul.controller';
import { ContaAzulIntegrationService } from './conta-azul-integration.service';
import { FinanceiroController } from './financeiro.controller';
import { FinanceiroCron } from './financeiro.cron';
import { FinanceiroService } from './financeiro.service';
import { InterIntegrationService } from './inter-integration.service';
import { NotasAbertasService } from './notas-abertas.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    NotificationsModule,
    StorageModule,
    ExternalItemsModule,
    QuotesModule,
  ],
  controllers: [FinanceiroController, ContaAzulController],
  providers: [
    FinanceiroService,
    NotasAbertasService,
    FinanceiroCron,
    ContaAzulIntegrationService,
    InterIntegrationService,
  ],
  exports: [
    FinanceiroService,
    NotasAbertasService,
    ContaAzulIntegrationService,
    InterIntegrationService,
  ],
})
export class FinanceiroModule {}
