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

    const permissions = await this.prisma.client.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
      include: {
        users: {
          where: { userId },
          select: { granted: true },
        },
      },
    });

    return permissions.map((permission) => ({
      id: permission.id,
      permissionId: permission.id,
      module: permission.module,
      action: permission.action,
      description: permission.description,
      granted: permission.users[0]?.granted ?? false,
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
