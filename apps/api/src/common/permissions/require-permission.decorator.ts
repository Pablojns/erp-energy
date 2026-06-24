import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../auth/jwt.guard';
import { PermissionGuard } from './permission.guard';

export const REQUIRE_PERMISSION_KEY = 'require_permission';

export interface RequiredPermission {
  module: string;
  action: string;
}

export const RequirePermission = (module: string, action: string) =>
  applyDecorators(
    SetMetadata(REQUIRE_PERMISSION_KEY, { module, action } satisfies RequiredPermission),
    UseGuards(JwtGuard, PermissionGuard),
  );
