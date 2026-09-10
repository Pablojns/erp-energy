import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ContaAzulController } from './conta-azul.controller';
import { ContaAzulIntegrationService } from './conta-azul-integration.service';
import { FinanceiroController } from './financeiro.controller';
import { FinanceiroCron } from './financeiro.cron';
import { FinanceiroService } from './financeiro.service';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  controllers: [FinanceiroController, ContaAzulController],
  providers: [FinanceiroService, FinanceiroCron, ContaAzulIntegrationService],
  exports: [FinanceiroService, ContaAzulIntegrationService],
})
export class FinanceiroModule {}
