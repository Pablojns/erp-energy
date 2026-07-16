import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderImportStatus, OrderSource } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';
import { PedidosService } from './pedidos.service';
import type { PedidosImportSummary } from './pedidos-import';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AppLogger } from '../common/logger/app-logger';

const PLANILHA_PATH =
  process.env.PLANILHA_PATH ??
  'C:\\Users\\SUNHUB\\Desktop\\RoboMercado\\Base_Logistica_Suprema.xlsx';

export type OrderImportTriggerValue = 'MANUAL' | 'AUTOMATIC' | 'SCHEDULED';

export type OrderImportLogEntry = {
  id: string;
  createdAt: string;
  importedAt: string | null;
  trigger: OrderImportTriggerValue;
  status: OrderImportStatus;
  fileName: string | null;
  importados: number;
  atualizados: number;
  ignorados: number;
  pedidosProcessados: number;
  errosCount: number;
  erros: string[];
  errorMessage: string | null;
};

function parseImportSummary(payloadSummary: string | null | undefined): PedidosImportSummary | null {
  if (!payloadSummary) return null;
  try {
    const parsed = JSON.parse(payloadSummary) as Partial<PedidosImportSummary>;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.importados !== 'number'
    ) {
      return null;
    }
    return {
      importados: parsed.importados ?? 0,
      atualizados: parsed.atualizados ?? 0,
      ignorados: parsed.ignorados ?? 0,
      erros: Array.isArray(parsed.erros) ? parsed.erros.map(String) : [],
      resetados: parsed.resetados,
    };
  } catch {
    return null;
  }
}

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
      trigger: 'SCHEDULED',
    });

    const buffer = await fs.readFile(PLANILHA_PATH);
    return this.importFromUpload(new Uint8Array(buffer), {
      trigger: 'SCHEDULED',
      fileName: path.basename(PLANILHA_PATH),
    });
  }

  async importarAgora() {
    return this.importarPlanilhaAutomatico();
  }

  async importFromUpload(
    buffer: Uint8Array,
    options: {
      trigger: OrderImportTriggerValue;
      fileName?: string;
      reset?: boolean;
    },
  ): Promise<PedidosImportSummary> {
    const trigger = options.trigger;
    const job = await this.prisma.client.orderImportJob.create({
      data: {
        source: OrderSource.WEG_MERCADO_ELETRONICO,
        importStatus: OrderImportStatus.PROCESSING,
        trigger,
        fileName: options.fileName ?? null,
        payloadSummary: options.fileName ?? null,
      },
    });

    this.logger.info('WEG spreadsheet import started', {
      jobId: job.id,
      trigger,
      fileName: options.fileName ?? null,
      reset: Boolean(options.reset),
    });

    try {
      const result = await this.pedidos.importarPlanilha(buffer, {
        reset: options.reset,
      });

      await this.prisma.client.orderImportJob.update({
        where: { id: job.id },
        data: {
          importStatus: OrderImportStatus.COMPLETED,
          importedAt: new Date(),
          payloadSummary: JSON.stringify(result),
        },
      });

      this.logger.info('WEG spreadsheet import finished', {
        jobId: job.id,
        trigger,
        fileName: options.fileName ?? null,
        importados: result.importados,
        atualizados: result.atualizados,
        ignorados: result.ignorados,
        erros: result.erros.length,
        pedidosProcessados: result.importados + result.atualizados,
      });

      return result;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'erro desconhecido';
      await this.prisma.client.orderImportJob.update({
        where: { id: job.id },
        data: {
          importStatus: OrderImportStatus.FAILED,
          errorMessage: msg,
        },
      });
      this.logger.error('WEG spreadsheet import failed', e, {
        jobId: job.id,
        trigger,
        fileName: options.fileName ?? null,
      });
      throw e;
    }
  }

  async listImportLogs(limit = 30): Promise<{ items: OrderImportLogEntry[] }> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const rows = await this.prisma.client.orderImportJob.findMany({
      where: { source: OrderSource.WEG_MERCADO_ELETRONICO },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    });

    return {
      items: rows.map((row) => this.toLogEntry(row)),
    };
  }

  private toLogEntry(row: {
    id: string;
    createdAt: Date;
    importedAt: Date | null;
    trigger: OrderImportTriggerValue;
    importStatus: OrderImportStatus;
    fileName: string | null;
    payloadSummary: string | null;
    errorMessage: string | null;
  }): OrderImportLogEntry {
    const summary = parseImportSummary(row.payloadSummary);
    const importados = summary?.importados ?? 0;
    const atualizados = summary?.atualizados ?? 0;
    const ignorados = summary?.ignorados ?? 0;
    const erros = summary?.erros ?? [];

    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      importedAt: row.importedAt?.toISOString() ?? null,
      trigger: row.trigger,
      status: row.importStatus,
      fileName: row.fileName,
      importados,
      atualizados,
      ignorados,
      pedidosProcessados: importados + atualizados,
      errosCount: erros.length,
      erros: erros.slice(0, 20),
      errorMessage: row.errorMessage,
    };
  }
}
