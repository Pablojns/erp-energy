import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { PrismaService } from '../../prisma/prisma.service';
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

    const permission = await this.prisma.client.permission.findUnique({
      where: {
        module_action: {
          module: required.module,
          action: required.action,
        },
      },
    });

    if (!permission) {
      throw new ForbiddenException('Permissão não configurada.');
    }

    const grant = await this.prisma.client.userPermission.findUnique({
      where: {
        userId_permissionId: {
          userId: user.id,
          permissionId: permission.id,
        },
      },
    });

    if (!grant?.granted) {
      throw new ForbiddenException('Sem permissão para esta ação.');
    }

    return true;
  }
}
