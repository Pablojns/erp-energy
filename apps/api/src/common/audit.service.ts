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
  }): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        userId: input.userId ?? undefined,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        changes:
          input.changes === undefined || input.changes === null
            ? undefined
            : (input.changes as object),
      },
    });
  }
}
