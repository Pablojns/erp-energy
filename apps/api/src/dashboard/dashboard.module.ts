import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../common/permissions/permissions.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [PrismaModule, AuthModule, PermissionsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
