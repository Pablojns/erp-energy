import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../common/permissions/permissions.module';
import { FinanceiroModule } from '../financeiro/financeiro.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [PrismaModule, AuthModule, PermissionsModule, FinanceiroModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
