import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSION_ACTION_ALIASES } from './permission-catalog';
import {
  REQUIRE_PERMISSION_KEY,
  type RequiredPermission,
} from './require-permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Usuário não autenticado.');
    }

    if (user.roles.includes('ADMIN')) {
      return true;
    }

    const actions = [
      required.action,
      ...(PERMISSION_ACTION_ALIASES[`${required.module}:${required.action}`] ?? []),
    ];

    const permissions = await this.prisma.client.permission.findMany({
      where: {
        module: required.module,
        action: { in: actions },
      },
      select: { id: true },
    });

    if (permissions.length === 0) {
      throw new ForbiddenException('Permissão não configurada.');
    }

    const grant = await this.prisma.client.userPermission.findFirst({
      where: {
        userId: user.id,
        granted: true,
        permissionId: { in: permissions.map((row) => row.id) },
      },
      select: { id: true },
    });

    if (!grant) {
      throw new ForbiddenException('Sem permissão para esta ação.');
    }

    return true;
  }
}
