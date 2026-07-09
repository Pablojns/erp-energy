/** Monta payload para o robô Flask de emissão de NF-e. */
export function buildNfFlaskPayload(
  numeroPed: string,
  pedido: any,
  opcoes?: { volume?: string; transportadora?: string },
) {
  const itens = (pedido?.items || pedido?.orderItems || [])
    .map((item: any) => ({
      seq: String(item.lineNumber || item.seq || 10),
      sku: item.sku,
      nome: item.description || item.nome || item.sku,
      quantidade: item.pickedQty ?? 0,
    }))
    .filter((item: { quantidade: number }) => item.quantidade > 0);

  return {
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
}

/** Interpreta resposta do Flask para um pedido específico. */
export function parseNfFlaskResult(numeroPed: string, resultado: any) {
  const sucesso = resultado.sucesso?.find(
    (s: any) => String(s.pedido) === String(numeroPed),
  );
  const erro = resultado.erros?.find(
    (e: any) => String(e.pedido) === String(numeroPed),
  );

  if (sucesso) return { ok: true as const, numeroNota: sucesso.nota };
  if (erro) return { ok: false as const, erro: erro.erro };
  return { ok: false as const, erro: 'Pedido não encontrado no resultado da automação' };
}

export async function callNfFlaskApi(payload: unknown) {
  const res = await fetch('http://127.0.0.1:5000/emitir-nf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const texto = await res.text();
    throw new Error(`Flask API erro ${res.status}: ${texto.slice(0, 200)}`);
  }

  return res.json();
}
