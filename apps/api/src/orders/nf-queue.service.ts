import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  buildNfFlaskPayload,
  callNfFlaskApi,
  parseNfFlaskResult,
} from './nf-flask-payload';

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
  private readonly logger = new Logger(NfQueueService.name);
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
    this.logger.log(
      `Job adicionado: ${job.id} | pedido ${numeroPed} | fila: ${
        this.fila.filter((j) => j.status === 'aguardando').length
      }`,
    );
    if (!this.processando) {
      this.logger.log('Iniciando processamento da fila...');
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
      this.logger.log('Fila vazia — worker pausado.');
      this.processando = false;
      return;
    }

    this.processando = true;
    proximo.status = 'processando';
    this.logger.log(`Processando pedido ${proximo.numeroPed}...`);

    try {
      const payload = buildNfFlaskPayload(
        proximo.numeroPed,
        proximo.pedidoCompleto,
        {
          volume: proximo.volume,
          transportadora: proximo.transportadora,
        },
      );

      this.logger.log(
        `Chamando Flask com payload: ${JSON.stringify(payload).slice(0, 200)}`,
      );

      const resultado = await callNfFlaskApi(payload);
      this.logger.log(`Resultado Flask: ${JSON.stringify(resultado).slice(0, 300)}`);

      const parsed = parseNfFlaskResult(proximo.numeroPed, resultado);

      if (parsed.ok) {
        proximo.status = 'concluido';
        proximo.numeroNota = parsed.numeroNota;
        proximo.concluidoEm = new Date();
        this.logger.log(
          `NF gerada: ${parsed.numeroNota} para pedido ${proximo.numeroPed}`,
        );
      } else {
        proximo.status = 'erro';
        proximo.erro = parsed.erro;
        proximo.concluidoEm = new Date();
        this.logger.error(
          `Erro no pedido ${proximo.numeroPed}: ${proximo.erro}`,
        );
      }
    } catch (e: any) {
      proximo.status = 'erro';
      proximo.erro = e?.message || 'Falha inesperada ao chamar Flask';
      proximo.concluidoEm = new Date();
      this.logger.error(
        `Exceção ao processar ${proximo.numeroPed}: ${e?.message || 'erro sem mensagem'}`,
      );
    }

    setTimeout(() => void this.processarProximo(), 3000);
  }
}
