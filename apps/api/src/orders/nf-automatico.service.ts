import { Injectable } from '@nestjs/common';
import {
  buildNfFlaskPayload,
  callNfFlaskApi,
  parseNfFlaskResult,
} from './nf-flask-payload';
import { AppLogger } from '../common/logger/app-logger';

@Injectable()
export class NfAutomaticoService {
  private readonly logger = new AppLogger(NfAutomaticoService.name);

  async emitirNfPedido(
    numeroPed: string,
    opcoes?: {
      volume?: string;
      transportadora?: string;
      pedidoCompleto?: any;
    },
  ) {
    const pedido = opcoes?.pedidoCompleto;
    const payload = buildNfFlaskPayload(numeroPed, pedido, opcoes);
    const resultado = await callNfFlaskApi(payload);
    return parseNfFlaskResult(numeroPed, resultado);
  }

  async listarTransportadoras(): Promise<string[]> {
    try {
      const res = await fetch('http://127.0.0.1:5000/transportadoras');
      return await res.json();
    } catch (error: unknown) {
      this.logger.warn('Transport provider unavailable; using fallback list', {
        fallbackUsed: true,
        error,
      });
      return ['EXPRESSO SAO MIGUEL', 'JADLOG'];
    }
  }
}
