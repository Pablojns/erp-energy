import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtGuard } from '../../auth/jwt.guard';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { UpdateUserPermissionDto } from './dto/update-user-permission.dto';
import { PermissionsService } from './permissions.service';

@Controller('api/permissions')
@UseGuards(JwtGuard)
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get()
  listAll() {
    return this.permissions.listAll();
  }
}

@Controller('api/users')
@UseGuards(JwtGuard)
export class UserPermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get(':id/permissions')
  listUserPermissions(@Param('id', ParseUUIDPipe) id: string) {
    return this.permissions.listUserPermissions(id);
  }

  @Patch(':id/permissions')
  updateUserPermission(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateUserPermissionDto,
  ) {
    this.permissions.assertAdmin(user.roles);
    return this.permissions.updateUserPermission(id, dto);
  }
}
