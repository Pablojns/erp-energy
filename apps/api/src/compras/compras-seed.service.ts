import { Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../common/logger/app-logger';
import { PrismaService } from '../prisma/prisma.service';
import { ensureDefaultPurchaseStages } from './compras.seed';

@Injectable()
export class ComprasSeedService implements OnModuleInit {
  private readonly logger = new AppLogger(ComprasSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await ensureDefaultPurchaseStages(this.prisma.client);
      this.logger.info('Purchase stages seed executed');
    } catch (err: unknown) {
      this.logger.warn('Purchase stages seed failed', {
        fallbackUsed: true,
        error: err,
      });
    }
  }
}
