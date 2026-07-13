import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { UpdateNotificationConfigDto } from './dto/update-notification-config.dto';
import {
  CONFIGURABLE_NOTIFICATION_TYPES,
  DEFAULT_PRIORITY_BY_TYPE,
  NOTIFICATION_PRIORITY,
  NOTIFICATION_TYPES,
} from './notification.constants';
import {
  ADMIN_ESCALATION_TYPES,
  DAILY_DIGEST_TYPES_BY_DEPARTMENT,
  DIGEST_ELIGIBLE_TYPES,
  DIGEST_TITLES,
  DigestItem,
  immediateAdminDepartmentsForType,
  primaryDepartmentsForType,
  USER_DEPARTMENTS,
  UserDepartment,
} from './notification-routing.constants';
import {
  isBusinessHours,
  getBrtParts,
  resolveSnoozeUntil,
} from './notification-time.util';
import { NotificationsSseService } from './notifications-sse.service';

export type CreateNotificationOptions = {
  entityId?: string | null;
  entityType?: string | null;
  priority?: string;
  skipPreferenceCheck?: boolean;
  skipDuplicateCheck?: boolean;
  skipSse?: boolean;
  skipDigest?: boolean;
  skipBusinessHours?: boolean;
};

export type NotifyRoutedInput = {
  type: string;
  title: string;
  body: string;
  link: string;
  entityId: string;
  entityType: string;
  label: string;
  priority?: string;
  directUserIds?: string[];
  skipBusinessHours?: boolean;
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
  snoozedUntil: Date | null;
  digestCount: number;
  digestItems: Prisma.JsonValue | null;
  primarySentAt: Date | null;
  escalatedToAdmin: boolean;
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

  /** Roteamento inteligente por departamento com suporte a digest. */
  async notifyRouted(input: NotifyRoutedInput): Promise<void> {
    if (!input.skipBusinessHours && !isBusinessHours()) {
      return;
    }

    const priority =
      input.priority ??
      DEFAULT_PRIORITY_BY_TYPE[input.type] ??
      NOTIFICATION_PRIORITY.NORMAL;

    if (input.directUserIds?.length) {
      await Promise.all(
        input.directUserIds.map((userId) =>
          this.deliverToUser(userId, input, priority),
        ),
      );
      return;
    }

    const primaryDepartments = primaryDepartmentsForType(input.type);
    const adminImmediate = immediateAdminDepartmentsForType(input.type);
    const departments = [...new Set([...primaryDepartments, ...adminImmediate])];

    if (!departments.length) {
      return;
    }

    const users = await this.findUsersByDepartments(departments);
    await Promise.all(
      users.map((user) => this.deliverToUser(user.id, input, priority)),
    );
  }

  async snooze(
    userId: string,
    notificationId: string,
    duration: '1h' | '2h' | '4h' | 'tomorrow',
  ) {
    const until = resolveSnoozeUntil(duration);
    const result = await this.prisma.client.notification.updateMany({
      where: { id: notificationId, userId },
      data: { snoozedUntil: until },
    });

    if (result.count === 0) {
      throw new NotFoundException('Notificação não encontrada.');
    }

    await this.emitUnreadCount(userId);
    return { ok: true, snoozedUntil: until.toISOString() };
  }

  async getDigestItems(userId: string, notificationId: string) {
    const row = await this.prisma.client.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!row) {
      throw new NotFoundException('Notificação não encontrada.');
    }

    const items = this.parseDigestItems(row.digestItems);
    return { items, digestCount: row.digestCount, type: row.type };
  }

  async getConfig() {
    const row = await this.ensureConfigRow();
    return {
      criticalStockThreshold: row.criticalStockThreshold,
      orderDelayedDays: row.orderDelayedDays,
      leadFollowupDays: row.leadFollowupDays,
      nfPendingHours: row.nfPendingHours,
    };
  }

  async updateConfig(dto: UpdateNotificationConfigDto) {
    const row = await this.ensureConfigRow();
    const updated = await this.prisma.client.notificationConfig.update({
      where: { id: row.id },
      data: {
        ...(dto.criticalStockThreshold !== undefined
          ? { criticalStockThreshold: dto.criticalStockThreshold }
          : {}),
        ...(dto.orderDelayedDays !== undefined
          ? { orderDelayedDays: dto.orderDelayedDays }
          : {}),
        ...(dto.leadFollowupDays !== undefined
          ? { leadFollowupDays: dto.leadFollowupDays }
          : {}),
        ...(dto.nfPendingHours !== undefined
          ? { nfPendingHours: dto.nfPendingHours }
          : {}),
      },
    });

    return {
      criticalStockThreshold: updated.criticalStockThreshold,
      orderDelayedDays: updated.orderDelayedDays,
      leadFollowupDays: updated.leadFollowupDays,
      nfPendingHours: updated.nfPendingHours,
    };
  }

  async wakeSnoozedNotifications(): Promise<number> {
    const result = await this.prisma.client.notification.updateMany({
      where: {
        snoozedUntil: { not: null, lte: new Date() },
      },
      data: { snoozedUntil: null },
    });
    return result.count;
  }

  async escalateUnresolvedToAdmin(): Promise<void> {
    const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const stale = await this.prisma.client.notification.findMany({
      where: {
        read: false,
        escalatedToAdmin: false,
        primarySentAt: { lte: cutoff },
        type: { in: [...ADMIN_ESCALATION_TYPES] },
        user: {
          isActive: true,
          OR: [
            { department: { not: 'ADMIN' } },
            { department: null },
          ],
        },
      },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        link: true,
        digestCount: true,
        digestItems: true,
        priority: true,
      },
    });

    if (!stale.length) return;

    const adminUsers = await this.findUsersByDepartments(['ADMIN']);
    if (!adminUsers.length) return;

    for (const notification of stale) {
      await this.prisma.client.notification.update({
        where: { id: notification.id },
        data: { escalatedToAdmin: true },
      });

      const escalationTitle = `[Escalado] ${notification.title}`;
      const escalationBody = `${notification.body} — sem resolução há mais de 4h.`;

      await Promise.all(
        adminUsers.map((admin) =>
          this.create(
            admin.id,
            escalationTitle,
            escalationBody,
            notification.type,
            notification.link ?? undefined,
            {
              entityType: 'escalation',
              entityId: notification.id,
              priority: NOTIFICATION_PRIORITY.URGENT,
              skipDuplicateCheck: true,
              skipDigest: true,
            },
          ),
        ),
      );
    }
  }

  async sendDailyDigests(): Promise<void> {
    const users = await this.prisma.client.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        department: true,
        userRoles: { include: { role: true } },
      },
    });

    for (const user of users) {
      await this.createDailyDigestForUser(user);
    }
  }

  private async createDailyDigestForUser(user: {
    id: string;
    name: string;
    department: string | null;
    userRoles: { role: { name: string } }[];
  }) {
    const enabled = await this.isTypeEnabledForUser(
      user.id,
      NOTIFICATION_TYPES.DAILY_DIGEST,
    );
    if (!enabled) return;

    const { year, month, day } = getBrtParts();
    const startOfDay = new Date(
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00-03:00`,
    );
    const existingToday = await this.prisma.client.notification.findFirst({
      where: {
        userId: user.id,
        type: NOTIFICATION_TYPES.DAILY_DIGEST,
        createdAt: { gte: startOfDay },
      },
      select: { id: true },
    });
    if (existingToday) return;

    const department = this.resolveUserDepartment(user);
    const relevantTypes = DAILY_DIGEST_TYPES_BY_DEPARTMENT[department] ?? [];
    if (!relevantTypes.length) return;

    const summary = await this.buildDailySummary(user.id, relevantTypes);
    if (!summary.lines.length) return;

    const firstName = user.name.split(/\s+/)[0] ?? user.name;
    await this.create(
      user.id,
      `☀️ Bom dia, ${firstName} — resumo do dia`,
      summary.lines.join('\n'),
      NOTIFICATION_TYPES.DAILY_DIGEST,
      summary.primaryLink,
      {
        entityType: 'daily_digest',
        priority: NOTIFICATION_PRIORITY.HIGH,
        skipDuplicateCheck: true,
        skipDigest: true,
        skipPreferenceCheck: false,
      },
    );
  }

  private async buildDailySummary(userId: string, types: string[]) {
    const lines: string[] = [];
    let primaryLink = '/app';

    const digestRows = await this.prisma.client.notification.findMany({
      where: {
        userId,
        read: false,
        entityType: 'digest',
        type: { in: types },
        ...this.snoozeVisibleWhere(),
      },
      select: { type: true, digestCount: true, link: true },
    });

    for (const row of digestRows) {
      const title = DIGEST_TITLES[row.type];
      if (!title) continue;
      lines.push(`• ${title.plural(row.digestCount)}`);
      if (row.link && primaryLink === '/app') {
        primaryLink = row.link;
      }
    }

    return { lines, primaryLink };
  }

  private async deliverToUser(
    userId: string,
    input: NotifyRoutedInput,
    priority: string,
  ) {
    if (DIGEST_ELIGIBLE_TYPES.has(input.type)) {
      await this.upsertDigestForUser(userId, input, priority);
      return;
    }

    await this.create(userId, input.title, input.body, input.type, input.link, {
      entityId: input.entityId,
      entityType: input.entityType,
      priority,
      skipDigest: true,
      skipBusinessHours: true,
    });
  }

  private async upsertDigestForUser(
    userId: string,
    input: NotifyRoutedInput,
    priority: string,
  ) {
    const enabled = await this.isTypeEnabledForUser(userId, input.type);
    if (!enabled) return;

    const item: DigestItem = {
      entityId: input.entityId,
      entityType: input.entityType,
      label: input.label,
      link: input.link,
    };

    const existing = await this.prisma.client.notification.findFirst({
      where: {
        userId,
        type: input.type,
        entityType: 'digest',
        read: false,
        ...this.snoozeVisibleWhere(),
      },
    });

    if (existing) {
      const items = this.parseDigestItems(existing.digestItems);
      if (items.some((row) => row.entityId === item.entityId)) {
        return;
      }

      items.push(item);
      const count = items.length;
      const titles = DIGEST_TITLES[input.type];
      const title = titles
        ? count === 1
          ? titles.singular
          : titles.plural(count)
        : input.title;
      const body = this.buildDigestBody(items);

      const updated = await this.prisma.client.notification.update({
        where: { id: existing.id },
        data: {
          digestCount: count,
          digestItems: items as unknown as Prisma.InputJsonValue,
          title,
          body,
          link: input.link,
          priority,
        },
      });

      await this.pushRealtime(userId, updated);
      return;
    }

    const titles = DIGEST_TITLES[input.type];
    const title = titles?.singular ?? input.title;
    const row = await this.prisma.client.notification.create({
      data: {
        userId,
        type: input.type,
        title,
        body: this.buildDigestBody([item]),
        link: input.link,
        entityId: null,
        entityType: 'digest',
        priority,
        digestCount: 1,
        digestItems: [item] as unknown as Prisma.InputJsonValue,
        primarySentAt: new Date(),
      },
    });

    await this.pushRealtime(userId, row);
  }

  private buildDigestBody(items: DigestItem[]): string {
    const preview = items
      .slice(0, 3)
      .map((item) => item.label)
      .join(', ');
    const suffix =
      items.length > 3 ? ` e mais ${items.length - 3}` : '';
    return `${preview}${suffix}. Toque para ver a lista completa.`;
  }

  private parseDigestItems(value: Prisma.JsonValue | null): DigestItem[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
      (row): row is DigestItem =>
        typeof row === 'object' &&
        row !== null &&
        'entityId' in row &&
        typeof (row as DigestItem).entityId === 'string',
    );
  }

  private async findUsersByDepartments(departments: UserDepartment[]) {
    const roleAdmins =
      departments.includes('ADMIN')
        ? await this.prisma.client.user.findMany({
            where: {
              isActive: true,
              userRoles: { some: { role: { name: 'ADMIN' } } },
            },
            select: { id: true, department: true },
          })
        : [];

    const byDepartment = await this.prisma.client.user.findMany({
      where: {
        isActive: true,
        department: { in: departments },
      },
      select: { id: true, department: true },
    });

    const map = new Map<string, { id: string; department: string | null }>();
    for (const user of [...byDepartment, ...roleAdmins]) {
      map.set(user.id, user);
    }
    return [...map.values()];
  }

  private resolveUserDepartment(user: {
    department: string | null;
    userRoles: { role: { name: string } }[];
  }): UserDepartment {
    if (
      user.department &&
      (USER_DEPARTMENTS as readonly string[]).includes(user.department)
    ) {
      return user.department as UserDepartment;
    }
    if (user.userRoles.some((row) => row.role.name === 'ADMIN')) {
      return 'ADMIN';
    }
    return 'OPERACIONAL';
  }

  private snoozeVisibleWhere(): Prisma.NotificationWhereInput {
    return {
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }],
    };
  }

  private async ensureConfigRow() {
    const existing = await this.prisma.client.notificationConfig.findFirst();
    if (existing) return existing;
    return this.prisma.client.notificationConfig.create({ data: {} });
  }

  async findPaginated(userId: string, query: ListNotificationsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...this.snoozeVisibleWhere(),
    };

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
        where: { userId, ...this.snoozeVisibleWhere() },
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
      where: { userId, read: false, ...this.snoozeVisibleWhere() },
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
    snoozedUntil?: Date | null;
    digestCount?: number;
    digestItems?: Prisma.JsonValue | null;
    primarySentAt?: Date | null;
    escalatedToAdmin?: boolean;
    createdAt: Date;
  }) {
    const digestItems = this.parseDigestItems(row.digestItems ?? null);
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
      snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
      digestCount: row.digestCount ?? 1,
      digestItems,
      isDigest: row.entityType === 'digest',
      primarySentAt: row.primarySentAt?.toISOString() ?? null,
      escalatedToAdmin: row.escalatedToAdmin ?? false,
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
