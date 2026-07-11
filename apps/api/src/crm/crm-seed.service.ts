import { Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../common/logger/app-logger';
import { PrismaService } from '../prisma/prisma.service';
import { seedCrmDefaults } from './crm.seed';

@Injectable()
export class CrmSeedService implements OnModuleInit {
  private readonly logger = new AppLogger(CrmSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await seedCrmDefaults(this.prisma.client);
      this.logger.info('CRM defaults seed executed');
    } catch (err: unknown) {
      this.logger.warn('CRM defaults seed failed', {
        fallbackUsed: true,
        error: err,
      });
    }
  }
}
