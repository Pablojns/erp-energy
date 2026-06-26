import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FinanceiroController } from './financeiro.controller';
import { FinanceiroCron } from './financeiro.cron';
import { FinanceiroService } from './financeiro.service';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  controllers: [FinanceiroController],
  providers: [FinanceiroService, FinanceiroCron],
  exports: [FinanceiroService],
})
export class FinanceiroModule {}
