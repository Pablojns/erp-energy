import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../common/permissions/permissions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CrmController } from './crm.controller';
import { CrmCron } from './crm.cron';
import { CrmSeedService } from './crm-seed.service';
import { CrmService } from './crm.service';

import { CrmPropostaService } from './crm-proposta.service';

@Module({
  imports: [PrismaModule, AuthModule, PermissionsModule, NotificationsModule],
  controllers: [CrmController],
  providers: [CrmService, CrmSeedService, CrmCron, CrmPropostaService],
  exports: [CrmService],
})
export class CrmModule {}
