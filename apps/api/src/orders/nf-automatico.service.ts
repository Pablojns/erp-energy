import { Injectable } from '@nestjs/common';

@Injectable()
export class NfAutomaticoService {
  async emitirNfPedido(
    numeroPed: string,
    opcoes?: {
      volume?: string;
      transportadora?: string;
      pedidoCompleto?: any;
    },
  ) {
    const pedido = opcoes?.pedidoCompleto;

    // Monta lista de itens no formato que o robô espera
    const itens = (pedido?.items || pedido?.orderItems || []).map((item: any) => ({
      seq: String(item.lineNumber || item.seq || 10),
      sku: item.sku,
      nome: item.description || item.nome || item.sku,
      quantidade: item.pickedQty || item.quantity,
    }));

    const payload = {
      pedidos: [
        {
          numeroPed: String(numeroPed),
          cnpj: pedido?.deliveryCnpj || pedido?.cnpj || '',
          itens,
          pontoDescarga: pedido?.unloadingPoint || pedido?.pontoDescarga || '',
          recebedor: pedido?.receiverName || pedido?.recebedor || '',
          volume: opcoes?.volume || '',
          transportadora: opcoes?.transportadora || null,
        },
      ],
    };

    const res = await fetch('http://127.0.0.1:5000/emitir-nf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const texto = await res.text();
      throw new Error(`Flask API erro ${res.status}: ${texto.slice(0, 200)}`);
    }

    const resultado = await res.json();

    const sucesso = resultado.sucesso?.find(
      (s: any) => String(s.pedido) === String(numeroPed),
    );
    const erro = resultado.erros?.find(
      (e: any) => String(e.pedido) === String(numeroPed),
    );

    if (sucesso) return { ok: true, numeroNota: sucesso.nota };
    if (erro) return { ok: false, erro: erro.erro };
    return { ok: false, erro: 'Pedido não encontrado no resultado da automação' };
  }

  async listarTransportadoras(): Promise<string[]> {
    try {
      const res = await fetch('http://127.0.0.1:5000/transportadoras');
      return await res.json();
    } catch {
      return ['EXPRESSO SAO MIGUEL', 'JADLOG'];
    }
  }
}
