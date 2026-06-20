import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { seedCarriers } from './carriers.seed';

@Injectable()
export class CarriersSeedService implements OnModuleInit {
  private readonly logger = new Logger(CarriersSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await seedCarriers(this.prisma.client);
      this.logger.log('Transportadoras padrão verificadas/criadas.');
    } catch (err) {
      this.logger.warn(
        `Falha ao semear transportadoras: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
