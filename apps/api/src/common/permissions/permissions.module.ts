import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PermissionGuard } from './permission.guard';
import { PermissionSyncService } from './permission-sync.service';
import {
  PermissionsController,
  UserPermissionsController,
} from './permissions.controller';
import { PermissionsService } from './permissions.service';

@Module({
  imports: [DiscoveryModule, PrismaModule, AuthModule],
  controllers: [PermissionsController, UserPermissionsController],
  providers: [PermissionsService, PermissionSyncService, PermissionGuard],
  exports: [PermissionGuard, PermissionsService],
})
export class PermissionsModule {}
