import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';

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
export class NfQueueService extends EventEmitter {
  private readonly logger = new Logger(NfQueueService.name);
  private fila: NfJobInterno[] = [];
  private processando = false;

  constructor() {
    super();
  }

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
    this.emit('job-adicionado', job);
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
    this.emit('job-atualizado', proximo);

    try {
      const pedido = proximo.pedidoCompleto;

      const itens = (pedido?.items || pedido?.orderItems || []).map((item: any) => ({
        seq: String(item.lineNumber || item.seq || 10),
        sku: item.sku,
        nome: item.description || item.nome || item.sku,
        quantidade: item.pickedQty ?? item.quantity,
      }));

      const payload = {
        pedidos: [
          {
            numeroPed: String(proximo.numeroPed),
            cnpj: pedido?.deliveryCnpj || '',
            itens,
            pontoDescarga: pedido?.unloadingPoint || '',
            recebedor: pedido?.receiverName || '',
            volume: proximo.volume || '',
            transportadora: proximo.transportadora || null,
          },
        ],
      };

      this.logger.log(
        `Chamando Flask com payload: ${JSON.stringify(payload).slice(0, 200)}`,
      );

      const res = await fetch('http://127.0.0.1:5000/emitir-nf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      this.logger.log(`Flask respondeu: ${res.status}`);

      if (!res.ok) {
        const texto = await res.text();
        throw new Error(`Flask ${res.status}: ${texto.slice(0, 300)}`);
      }

      const resultado = await res.json();
      this.logger.log(`Resultado Flask: ${JSON.stringify(resultado).slice(0, 300)}`);

      const sucesso = resultado.sucesso?.find(
        (s: any) => String(s.pedido) === String(proximo.numeroPed),
      );
      const erroItem = resultado.erros?.find(
        (e: any) => String(e.pedido) === String(proximo.numeroPed),
      );

      if (sucesso) {
        proximo.status = 'concluido';
        proximo.numeroNota = sucesso.nota;
        proximo.concluidoEm = new Date();
        this.logger.log(
          `✅ NF gerada: ${sucesso.nota} para pedido ${proximo.numeroPed}`,
        );
      } else {
        proximo.status = 'erro';
        proximo.erro = erroItem?.erro || 'Pedido não encontrado no resultado';
        proximo.concluidoEm = new Date();
        this.logger.error(
          `❌ Erro no pedido ${proximo.numeroPed}: ${proximo.erro}`,
        );
      }
    } catch (e: any) {
      proximo.status = 'erro';
      proximo.erro = e?.message || 'Falha inesperada ao chamar Flask';
      proximo.concluidoEm = new Date();
      this.logger.error(
        `❌ Exceção ao processar ${proximo.numeroPed}: ${e?.message || 'erro sem mensagem'}`,
      );
    }

    this.emit('job-atualizado', proximo);
    setTimeout(() => void this.processarProximo(), 3000);
  }
}
