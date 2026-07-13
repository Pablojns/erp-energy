import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import {
  CONFIGURABLE_NOTIFICATION_TYPES,
  DEFAULT_PRIORITY_BY_TYPE,
  NOTIFICATION_PRIORITY,
} from './notification.constants';
import { NotificationsSseService } from './notifications-sse.service';

export type CreateNotificationOptions = {
  entityId?: string | null;
  entityType?: string | null;
  priority?: string;
  skipPreferenceCheck?: boolean;
  skipDuplicateCheck?: boolean;
  skipSse?: boolean;
};

type NotificationRow = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  entityId: string | null;
  entityType: string | null;
  read: boolean;
  readAt: Date | null;
  priority: string;
  createdAt: Date;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sse: NotificationsSseService,
  ) {}

  async create(
    userId: string,
    title: string,
    message: string,
    type: string,
    link?: string,
    options: CreateNotificationOptions = {},
  ) {
    const entityMeta = this.resolveEntityMeta(link, options);
    const priority =
      options.priority ??
      DEFAULT_PRIORITY_BY_TYPE[type] ??
      NOTIFICATION_PRIORITY.NORMAL;

    if (!options.skipPreferenceCheck) {
      const enabled = await this.isTypeEnabledForUser(userId, type);
      if (!enabled) return null;
    }

    if (!options.skipDuplicateCheck && entityMeta.entityId) {
      const duplicate = await this.hasUnreadDuplicate(
        type,
        entityMeta.entityId,
      );
      if (duplicate) return null;
    }

    const row = await this.prisma.client.notification.create({
      data: {
        userId,
        title,
        body: message,
        type,
        link: link ?? null,
        entityId: entityMeta.entityId,
        entityType: entityMeta.entityType,
        priority,
      },
    });

    if (!options.skipSse) {
      await this.pushRealtime(userId, row);
    }

    return this.serialize(row);
  }

  async createForPermission(
    permissionModule: string,
    permissionAction: string,
    title: string,
    message: string,
    type: string,
    link?: string,
    options: CreateNotificationOptions = {},
  ): Promise<void> {
    const userIds = await this.resolvePermissionRecipients(
      permissionModule,
      permissionAction,
    );

    await Promise.all(
      [...userIds].map((id) =>
        this.create(id, title, message, type, link, options),
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
    options: CreateNotificationOptions = {},
  ): Promise<void> {
    const userIds = await this.resolvePermissionRecipients(
      permissionModule,
      permissionAction,
    );
    userIds.delete(excludeUserId);

    await Promise.all(
      [...userIds].map((id) =>
        this.create(id, title, message, type, link, options),
      ),
    );
  }

  async createForAdmins(
    title: string,
    message: string,
    type: string,
    link?: string,
    options: CreateNotificationOptions = {},
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
        this.create(admin.id, title, message, type, link, options),
      ),
    );
  }

  async findPaginated(userId: string, query: ListNotificationsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.NotificationWhereInput = { userId };

    if (query.read !== undefined) {
      where.read = query.read;
    }

    if (query.priority === 'urgent') {
      where.priority = {
        in: [NOTIFICATION_PRIORITY.URGENT, NOTIFICATION_PRIORITY.HIGH],
      };
    } else if (query.priority) {
      where.priority = query.priority;
    }

    const [rows, total] = await Promise.all([
      this.prisma.client.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.client.notification.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.serialize(row)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  /** Compatibilidade com clientes que esperam array completo. */
  findAll(userId: string) {
    return this.prisma.client.notification
      .findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      })
      .then((rows) => rows.map((row) => this.serialize(row)));
  }

  async markRead(userId: string, notificationId: string) {
    const result = await this.prisma.client.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true, readAt: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException('Notificação não encontrada.');
    }

    await this.emitUnreadCount(userId);
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.client.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });

    await this.emitUnreadCount(userId);
    return { ok: true };
  }

  async deleteOne(userId: string, notificationId: string) {
    const result = await this.prisma.client.notification.deleteMany({
      where: { id: notificationId, userId },
    });

    if (result.count === 0) {
      throw new NotFoundException('Notificação não encontrada.');
    }

    await this.emitUnreadCount(userId);
    return { ok: true };
  }

  async deleteAllRead(userId: string) {
    await this.prisma.client.notification.deleteMany({
      where: { userId, read: true },
    });

    await this.emitUnreadCount(userId);
    return { ok: true };
  }

  countUnread(userId: string) {
    return this.prisma.client.notification.count({
      where: { userId, read: false },
    });
  }

  async hasUnreadDuplicate(
    type: string,
    entityId: string | null | undefined,
  ): Promise<boolean> {
    if (!entityId) return false;

    const existing = await this.prisma.client.notification.findFirst({
      where: { type, entityId, read: false },
      select: { id: true },
    });
    return Boolean(existing);
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

  async getPreferences(userId: string) {
    const row = await this.prisma.client.userNotificationPreferences.findUnique(
      {
        where: { userId },
      },
    );

    const stored = (row?.preferences ?? {}) as Record<string, boolean>;
    const preferences = Object.fromEntries(
      CONFIGURABLE_NOTIFICATION_TYPES.map((item) => [
        item.type,
        stored[item.type] !== false,
      ]),
    ) as Record<string, boolean>;

    return { preferences };
  }

  async updatePreferences(
    userId: string,
    preferences: Record<string, boolean>,
  ) {
    const sanitized = Object.fromEntries(
      CONFIGURABLE_NOTIFICATION_TYPES.map((item) => [
        item.type,
        preferences[item.type] !== false,
      ]),
    );

    await this.prisma.client.userNotificationPreferences.upsert({
      where: { userId },
      create: { userId, preferences: sanitized },
      update: { preferences: sanitized },
    });

    return { preferences: sanitized };
  }

  private async isTypeEnabledForUser(
    userId: string,
    type: string,
  ): Promise<boolean> {
    const configurable = CONFIGURABLE_NOTIFICATION_TYPES.some(
      (row) => row.type === type,
    );
    if (!configurable) return true;

    const row = await this.prisma.client.userNotificationPreferences.findUnique(
      {
        where: { userId },
        select: { preferences: true },
      },
    );
    if (!row) return true;

    const prefs = row.preferences as Record<string, boolean>;
    return prefs[type] !== false;
  }

  private resolveEntityMeta(
    link: string | undefined,
    options: CreateNotificationOptions,
  ): { entityId: string | null; entityType: string | null } {
    if (options.entityId || options.entityType) {
      return {
        entityId: options.entityId ?? null,
        entityType: options.entityType ?? null,
      };
    }

    if (!link) {
      return { entityId: null, entityType: null };
    }

    if (link.startsWith('order:')) {
      return { entityId: link.slice('order:'.length), entityType: 'order' };
    }
    if (link.startsWith('product:')) {
      return { entityId: link.slice('product:'.length), entityType: 'product' };
    }
    if (link.startsWith('crm:card:')) {
      return {
        entityId: link.slice('crm:card:'.length),
        entityType: 'crm_card',
      };
    }
    if (link.startsWith('purchase:')) {
      return {
        entityId: link.slice('purchase:'.length),
        entityType: 'purchase',
      };
    }

    return { entityId: null, entityType: null };
  }

  private serialize(row: {
    id: string;
    userId: string;
    type: string;
    title: string;
    body: string;
    link: string | null;
    entityId: string | null;
    entityType: string | null;
    read: boolean;
    readAt: Date | null;
    priority: string;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      userId: row.userId,
      type: row.type,
      title: row.title,
      body: row.body,
      message: row.body,
      link: row.link,
      entityId: row.entityId,
      entityType: row.entityType,
      read: row.read,
      readAt: row.readAt?.toISOString() ?? null,
      priority: row.priority,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async pushRealtime(
    userId: string,
    row: NotificationRow | { id: string },
  ) {
    const full =
      'body' in row
        ? row
        : await this.prisma.client.notification.findUnique({
            where: { id: row.id },
          });

    if (!full) return;

    this.sse.emit({
      userId,
      event: 'notification',
      data: this.serialize(full),
    });
    await this.emitUnreadCount(userId);
  }

  private async emitUnreadCount(userId: string) {
    const count = await this.countUnread(userId);
    this.sse.emit({
      userId,
      event: 'unread_count',
      data: { count },
    });
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
