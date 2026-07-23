import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { seedCompanyEntities } from './company-entities.seed';
import { AppLogger } from '../common/logger/app-logger';

@Injectable()
export class CompanyEntitiesSeedService implements OnModuleInit {
  private readonly logger = new AppLogger(CompanyEntitiesSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await seedCompanyEntities(this.prisma.client);
      this.logger.info('CompanyEntity seed executed');
    } catch (err: unknown) {
      this.logger.warn('CompanyEntity seed failed', {
        fallbackUsed: true,
        error: err,
      });
    }
  }
}
