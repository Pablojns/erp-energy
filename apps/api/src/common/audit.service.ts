import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    userId?: string | null;
    action: string;
    entity: string;
    entityId: string;
    changes?: Record<string, unknown> | null;
    ipAddress?: string | null;
  }): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        userId: input.userId ?? undefined,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        ipAddress: input.ipAddress ?? undefined,
        changes:
          input.changes === undefined || input.changes === null
            ? undefined
            : (input.changes as object),
      },
    });
  }

  async logDataAccess(
    userId: string,
    entity: string,
    entityId: string,
    action: string,
    ip?: string | null,
  ): Promise<void> {
    const timestamp = new Date();
    await this.log({
      userId,
      action: 'DATA_ACCESS',
      entity,
      entityId,
      ipAddress: ip ?? null,
      changes: {
        action,
        ip: ip ?? null,
        timestamp: timestamp.toISOString(),
      },
    });
  }
}
