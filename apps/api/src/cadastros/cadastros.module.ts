import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditService } from '../common/audit.service';
import { PermissionsModule } from '../common/permissions/permissions.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CadastrosController } from './cadastros.controller';
import { CadastrosService } from './cadastros.service';
import { CarriersSeedService } from './carriers-seed.service';
import { CompanyEntitiesSeedService } from './company-entities-seed.service';

@Module({
  imports: [PrismaModule, AuthModule, PermissionsModule],
  controllers: [CadastrosController],
  providers: [
    CadastrosService,
    CarriersSeedService,
    CompanyEntitiesSeedService,
    AuditService,
  ],
  exports: [CadastrosService],
})
export class CadastrosModule {}
