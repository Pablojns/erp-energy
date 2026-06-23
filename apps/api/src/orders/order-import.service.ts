import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderImportStatus, OrderSource } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';
import { PedidosService } from './pedidos.service';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AppLogger } from '../common/logger/app-logger';

const PLANILHA_PATH =
  process.env.PLANILHA_PATH ??
  'C:\\Users\\SUNHUB\\Desktop\\RoboMercado\\Base_Logistica_Suprema.xlsx';

@Injectable()
export class OrderImportService {
  private readonly logger = new AppLogger(OrderImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pedidos: PedidosService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async importarPlanilhaAutomatico() {
    this.logger.info('Starting scheduled spreadsheet import', {
      source: OrderSource.WEG_MERCADO_ELETRONICO,
      planilhaPath: path.basename(PLANILHA_PATH),
    });

    const job = await this.prisma.client.orderImportJob.create({
      data: {
        source: OrderSource.WEG_MERCADO_ELETRONICO,
        importStatus: OrderImportStatus.PROCESSING,
        payloadSummary: PLANILHA_PATH,
      },
    });

    try {
      const buffer = await fs.readFile(PLANILHA_PATH);
      const result = await this.pedidos.importarPlanilha(new Uint8Array(buffer));

      await this.prisma.client.orderImportJob.update({
        where: { id: job.id },
        data: {
          importStatus: OrderImportStatus.COMPLETED,
          importedAt: new Date(),
          payloadSummary: JSON.stringify(result),
        },
      });

      this.logger.info('Spreadsheet import finished', {
        jobId: job.id,
        importados: result.importados,
        atualizados: result.atualizados,
        ignorados: result.ignorados,
        erros: result.erros.length,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'erro desconhecido';
      await this.prisma.client.orderImportJob.update({
        where: { id: job.id },
        data: {
          importStatus: OrderImportStatus.FAILED,
          errorMessage: msg,
        },
      });
      this.logger.error('Spreadsheet import failed', e, {
        jobId: job.id,
      });
    }
  }

  async importarAgora() {
    return this.importarPlanilhaAutomatico();
  }
}