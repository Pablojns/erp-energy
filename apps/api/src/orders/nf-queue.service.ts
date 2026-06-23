import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';
import {
  buildNfFlaskPayload,
  callNfFlaskApi,
  parseNfFlaskResult,
} from './nf-flask-payload';
import { AppLogger } from '../common/logger/app-logger';

export type NfJobStatus = 'aguardando' | 'processando' | 'concluido' | 'erro';

export interface NfJob {
  id: string;
  numeroPed: string;
  volume?: string;
  transportadora?: string;
  status: NfJobStatus;
  numeroNota?: string;
  erro?: string;
  criadoEm: Date;
  concluidoEm?: Date;
}

type NfJobInterno = NfJob & { pedidoCompleto?: any };

@Injectable()
export class NfQueueService {
  private readonly logger = new AppLogger(NfQueueService.name);
  private fila: NfJobInterno[] = [];
  private processando = false;

  adicionarNaFila(
    numeroPed: string,
    pedidoCompleto: any,
    opcoes?: {
      volume?: string;
      transportadora?: string;
    },
  ): NfJob {
    const job: NfJobInterno = {
      id: crypto.randomUUID(),
      numeroPed,
      volume: opcoes?.volume,
      transportadora: opcoes?.transportadora,
      status: 'aguardando',
      criadoEm: new Date(),
      pedidoCompleto,
    };
    this.fila.push(job);
    this.logger.info('NF job enqueued', {
      jobId: job.id,
      numeroPed,
      queueWaiting: this.fila.filter((j) => j.status === 'aguardando').length,
    });
    if (!this.processando) {
      this.logger.info('NF queue worker started');
      void this.processarProximo();
    }
    return job;
  }

  listarJobs(): NfJob[] {
    const limite = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.fila.filter((job) => job.criadoEm > limite);
  }

  buscarJob(id: string): NfJob | undefined {
    return this.fila.find((job) => job.id === id);
  }

  private async processarProximo() {
    const proximo = this.fila.find((job) => job.status === 'aguardando');
    if (!proximo) {
      this.logger.info('NF queue empty, worker paused');
      this.processando = false;
      return;
    }

    this.processando = true;
    proximo.status = 'processando';
    this.logger.info('Processing NF job', {
      jobId: proximo.id,
      numeroPed: proximo.numeroPed,
    });

    try {
      const payload = buildNfFlaskPayload(
        proximo.numeroPed,
        proximo.pedidoCompleto,
        {
          volume: proximo.volume,
          transportadora: proximo.transportadora,
        },
      );

      const itemCount = Array.isArray((payload as { pedidos?: unknown[] }).pedidos)
        ? ((payload as { pedidos: Array<{ itens?: unknown[] }> }).pedidos[0]?.itens
            ?.length ?? 0)
        : 0;
      this.logger.info('Calling NF Flask provider', {
        jobId: proximo.id,
        numeroPed: proximo.numeroPed,
        itemCount,
        hasTransportadora: Boolean(proximo.transportadora),
      });

      const resultado = await callNfFlaskApi(payload);
      this.logger.info('NF Flask provider response received', {
        jobId: proximo.id,
        numeroPed: proximo.numeroPed,
      });

      const parsed = parseNfFlaskResult(proximo.numeroPed, resultado);

      if (parsed.ok) {
        proximo.status = 'concluido';
        proximo.numeroNota = parsed.numeroNota;
        proximo.concluidoEm = new Date();
        this.logger.info('NF generated successfully', {
          jobId: proximo.id,
          numeroPed: proximo.numeroPed,
          numeroNota: parsed.numeroNota,
        });
      } else {
        proximo.status = 'erro';
        proximo.erro = parsed.erro;
        proximo.concluidoEm = new Date();
        this.logger.error('NF generation failed', undefined, {
          jobId: proximo.id,
          numeroPed: proximo.numeroPed,
          reason: parsed.erro,
        });
      }
    } catch (e: unknown) {
      proximo.status = 'erro';
      proximo.erro =
        e instanceof Error ? e.message : 'Falha inesperada ao chamar Flask';
      proximo.concluidoEm = new Date();
      this.logger.error('Unhandled NF queue exception', e, {
        jobId: proximo.id,
        numeroPed: proximo.numeroPed,
      });
    }

    setTimeout(() => void this.processarProximo(), 3000);
  }
}
