import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderImportStatus, OrderSource } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';
import { PedidosService } from './pedidos.service';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const PLANILHA_PATH =
  process.env.PLANILHA_PATH ??
  'C:\\Users\\SUNHUB\\Desktop\\RoboMercado\\Base_Logistica_Suprema.xlsx';

@Injectable()
export class OrderImportService {
  private readonly logger = new Logger(OrderImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pedidos: PedidosService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async importarPlanilhaAutomatico() {
    this.logger.log('Iniciando importação automática da planilha...');

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

      this.logger.log(
        `Importação concluída: ${result.importados} importados, ${result.atualizados} atualizados, ${result.ignorados} ignorados`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'erro desconhecido';
      await this.prisma.client.orderImportJob.update({
        where: { id: job.id },
        data: {
          importStatus: OrderImportStatus.FAILED,
          errorMessage: msg,
        },
      });
      this.logger.error(`Importação falhou: ${msg}`);
    }
  }

  async importarAgora() {
    return this.importarPlanilhaAutomatico();
  }
}