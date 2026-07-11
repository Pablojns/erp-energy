import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../common/permissions/permissions.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CrmController } from './crm.controller';
import { CrmSeedService } from './crm-seed.service';
import { CrmService } from './crm.service';

@Module({
  imports: [PrismaModule, AuthModule, PermissionsModule],
  controllers: [CrmController],
  providers: [CrmService, CrmSeedService],
  exports: [CrmService],
})
export class CrmModule {}
