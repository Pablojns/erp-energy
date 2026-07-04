import { Injectable } from '@nestjs/common';
import { PedidosService } from './pedidos.service';

@Injectable()
export class PedidosEtiquetaService {
  constructor(private readonly pedidos: PedidosService) {}

  generatePdf(numeroPed: string): Promise<{ buffer: Buffer; filename: string }> {
    return this.pedidos.gerarEtiquetaPdf(numeroPed);
  }
}
