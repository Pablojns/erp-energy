import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    title: string,
    message: string,
    type: string,
    link?: string,
  ) {
    return this.prisma.client.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        link: link ?? null,
      },
    });
  }

  async createForPermission(
    permissionModule: string,
    permissionAction: string,
    title: string,
    message: string,
    type: string,
    link?: string,
  ): Promise<void> {
    const userIds = await this.resolvePermissionRecipients(
      permissionModule,
      permissionAction,
    );

    await Promise.all(
      [...userIds].map((id) =>
        this.create(id, title, message, type, link),
      ),
    );
  }

  async createForPermissionExcluding(
    permissionModule: string,
    permissionAction: string,
    title: string,
    message: string,
    type: string,
    link: string | undefined,
    excludeUserId: string,
  ): Promise<void> {
    const userIds = await this.resolvePermissionRecipients(
      permissionModule,
      permissionAction,
    );
    userIds.delete(excludeUserId);

    await Promise.all(
      [...userIds].map((id) =>
        this.create(id, title, message, type, link),
      ),
    );
  }

  async createForAdmins(
    title: string,
    message: string,
    type: string,
    link?: string,
  ): Promise<void> {
    const admins = await this.prisma.client.user.findMany({
      where: {
        isActive: true,
        userRoles: { some: { role: { name: 'ADMIN' } } },
      },
      select: { id: true },
    });

    await Promise.all(
      admins.map((admin) =>
        this.create(admin.id, title, message, type, link),
      ),
    );
  }

  findAll(userId: string) {
    return this.prisma.client.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markRead(userId: string, notificationId: string) {
    const result = await this.prisma.client.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });

    if (result.count === 0) {
      throw new NotFoundException('Notificação não encontrada.');
    }

    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.client.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    return { ok: true };
  }

  countUnread(userId: string) {
    return this.prisma.client.notification.count({
      where: { userId, read: false },
    });
  }

  async hasRecentDuplicate(type: string, link: string): Promise<boolean> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await this.prisma.client.notification.findFirst({
      where: {
        type,
        link,
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    return Boolean(existing);
  }

  private async resolvePermissionRecipients(
    permissionModule: string,
    permissionAction: string,
  ): Promise<Set<string>> {
    const userIds = new Set<string>();

    const admins = await this.prisma.client.user.findMany({
      where: {
        isActive: true,
        userRoles: { some: { role: { name: 'ADMIN' } } },
      },
      select: { id: true },
    });
    for (const admin of admins) {
      userIds.add(admin.id);
    }

    const permission = await this.prisma.client.permission.findUnique({
      where: {
        module_action: { module: permissionModule, action: permissionAction },
      },
      select: { id: true },
    });

    if (!permission) {
      return userIds;
    }

    const granted = await this.prisma.client.userPermission.findMany({
      where: {
        permissionId: permission.id,
        granted: true,
        user: { isActive: true },
      },
      select: { userId: true },
    });

    for (const row of granted) {
      userIds.add(row.userId);
    }

    return userIds;
  }
}
