import * as crypto from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { AppLogger } from '../common/logger/app-logger';
import { PedidosService } from './pedidos.service';

export type NfLoteItemStatus =
  | 'aguardando'
  | 'processando'
  | 'concluido'
  | 'erro';

export type NfLoteJobStatus = 'processando' | 'concluido';

export type NfLoteItemState = {
  numeroPed: string;
  status: NfLoteItemStatus;
  logs: string[];
  numeroNF?: string;
  erro?: string;
};

export type NfLoteJobState = {
  jobId: string;
  status: NfLoteJobStatus;
  items: NfLoteItemState[];
  processedCount: number;
  successCount: number;
  errorCount: number;
  total: number;
  createdAt: string;
  finishedAt?: string;
};

type NfLoteJobInternal = {
  id: string;
  userId: string;
  status: NfLoteJobStatus;
  items: NfLoteItemState[];
  createdAt: Date;
  finishedAt?: Date;
};

function extractLogsFromResultado(resultado: unknown): string[] {
  if (!resultado || typeof resultado !== 'object') return [];
  const row = resultado as Record<string, unknown>;
  if (Array.isArray(row.log)) {
    return row.log.map((line) => String(line));
  }
  if (Array.isArray(row.logs)) {
    return row.logs.map((line) => String(line));
  }
  return [];
}

@Injectable()
export class NfLoteService {
  private readonly logger = new AppLogger(NfLoteService.name);
  private readonly jobs = new Map<string, NfLoteJobInternal>();

  constructor(private readonly pedidos: PedidosService) {}

  startJob(userId: string, numeroPeds: string[]): NfLoteJobState {
    const unique = [
      ...new Set(
        numeroPeds
          .map((n) => n.trim().replace(/^#/, ''))
          .filter(Boolean),
      ),
    ];
    if (unique.length === 0) {
      throw new NotFoundException('Nenhum número de pedido informado.');
    }

    const job: NfLoteJobInternal = {
      id: crypto.randomUUID(),
      userId,
      status: 'processando',
      createdAt: new Date(),
      items: unique.map((numeroPed) => ({
        numeroPed,
        status: 'aguardando',
        logs: [],
      })),
    };
    this.jobs.set(job.id, job);
    this.logger.info('NF lote job started', {
      jobId: job.id,
      count: unique.length,
      userId,
    });

    void this.processJob(job.id);
    return this.toPublic(job);
  }

  getJob(jobId: string): NfLoteJobState {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new NotFoundException('Job de NF em lote não encontrado.');
    }
    return this.toPublic(job);
  }

  private async processJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    for (const item of job.items) {
      item.status = 'processando';
      item.logs = ['Iniciando emissão de NF…'];
      this.logger.info('NF lote item processing', {
        jobId,
        numeroPed: item.numeroPed,
      });

      try {
        // Emissão individual e em lote: attachInvoice apenas (sem generateExitFromInvoice).
        const res = await this.pedidos.gerarNfFlask(
          item.numeroPed,
          job.userId,
        );
        const logs = extractLogsFromResultado(res.resultado);
        item.logs =
          logs.length > 0
            ? logs
            : [`NF-e ${res.numeroNF} gerada com sucesso.`];
        item.numeroNF = res.numeroNF;
        item.status = 'concluido';
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : 'Falha ao emitir NF neste pedido.';
        item.status = 'erro';
        item.erro = message;
        item.logs = [...item.logs, `Erro: ${message}`];
        this.logger.error('NF lote item failed', error, {
          jobId,
          numeroPed: item.numeroPed,
        });
      }
    }

    job.status = 'concluido';
    job.finishedAt = new Date();
    this.logger.info('NF lote job finished', {
      jobId,
      success: job.items.filter((i) => i.status === 'concluido').length,
      errors: job.items.filter((i) => i.status === 'erro').length,
    });

    // Limpa jobs antigos (>6h) eventualmente.
    this.pruneOldJobs();
  }

  private pruneOldJobs() {
    const limit = Date.now() - 6 * 60 * 60 * 1000;
    for (const [id, job] of this.jobs) {
      if (job.createdAt.getTime() < limit) {
        this.jobs.delete(id);
      }
    }
  }

  private toPublic(job: NfLoteJobInternal): NfLoteJobState {
    const successCount = job.items.filter((i) => i.status === 'concluido').length;
    const errorCount = job.items.filter((i) => i.status === 'erro').length;
    const processedCount = successCount + errorCount;
    return {
      jobId: job.id,
      status: job.status,
      items: job.items.map((item) => ({ ...item, logs: [...item.logs] })),
      processedCount,
      successCount,
      errorCount,
      total: job.items.length,
      createdAt: job.createdAt.toISOString(),
      finishedAt: job.finishedAt?.toISOString(),
    };
  }
}
