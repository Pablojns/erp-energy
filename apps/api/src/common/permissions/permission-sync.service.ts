import { Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../logger/app-logger';
import {
  REQUIRE_PERMISSION_KEY,
  type RequiredPermission,
} from './require-permission.decorator';

@Injectable()
export class PermissionSyncService implements OnModuleInit {
  private readonly logger = new AppLogger(PermissionSyncService.name);

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const controllers = this.discovery.getControllers();
    const seen = new Set<string>();
    let synced = 0;

    for (const wrapper of controllers) {
      const { instance } = wrapper;
      if (!instance) continue;

      const prototype = Object.getPrototypeOf(instance) as object;
      const methodNames = this.metadataScanner.getAllMethodNames(prototype);

      for (const methodName of methodNames) {
        const handler = prototype[methodName as keyof typeof prototype];
        if (typeof handler !== 'function') continue;

        const meta = this.reflector.get<RequiredPermission>(
          REQUIRE_PERMISSION_KEY,
          handler,
        );
        if (!meta) continue;

        const key = `${meta.module}:${meta.action}`;
        if (seen.has(key)) continue;
        seen.add(key);

        await this.prisma.client.permission.upsert({
          where: {
            module_action: {
              module: meta.module,
              action: meta.action,
            },
          },
          create: {
            module: meta.module,
            action: meta.action,
          },
          update: {},
        });
        synced += 1;
      }
    }

    this.logger.info('Permissions synced from controllers', { synced });
  }
}
