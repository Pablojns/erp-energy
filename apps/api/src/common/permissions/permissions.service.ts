import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { UpdateUserPermissionDto } from './dto/update-user-permission.dto';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  listAll() {
    return this.prisma.client.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
  }

  async listUserPermissions(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const [permissions, grants] = await Promise.all([
      this.prisma.client.permission.findMany({
        orderBy: [{ module: 'asc' }, { action: 'asc' }],
      }),
      this.prisma.client.userPermission.findMany({
        where: { userId },
      }),
    ]);

    const grantMap = new Map(grants.map((g) => [g.permissionId, g.granted]));

    return permissions.map((permission) => ({
      permissionId: permission.id,
      module: permission.module,
      action: permission.action,
      description: permission.description,
      granted: grantMap.get(permission.id) ?? false,
    }));
  }

  async updateUserPermission(
    userId: string,
    dto: UpdateUserPermissionDto,
  ) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const permission = await this.prisma.client.permission.findUnique({
      where: { id: dto.permissionId },
    });
    if (!permission) {
      throw new NotFoundException('Permissão não encontrada.');
    }

    return this.prisma.client.userPermission.upsert({
      where: {
        userId_permissionId: {
          userId,
          permissionId: dto.permissionId,
        },
      },
      create: {
        userId,
        permissionId: dto.permissionId,
        granted: dto.granted,
      },
      update: {
        granted: dto.granted,
      },
    });
  }

  assertAdmin(roles: string[]): void {
    if (!roles.includes('ADMIN')) {
      throw new ForbiddenException(
        'Apenas administradores podem alterar permissões.',
      );
    }
  }
}
