import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { seedCarriers } from './carriers.seed';
import { AppLogger } from '../common/logger/app-logger';

@Injectable()
export class CarriersSeedService implements OnModuleInit {
  private readonly logger = new AppLogger(CarriersSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await seedCarriers(this.prisma.client);
      this.logger.info('Default carriers seed executed');
    } catch (err: unknown) {
      this.logger.warn('Default carriers seed failed', {
        fallbackUsed: true,
        error: err,
      });
    }
  }
}
