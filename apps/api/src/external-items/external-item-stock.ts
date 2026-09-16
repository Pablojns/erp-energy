import { randomUUID } from 'crypto';
import { Prisma } from '@erp/database';

export type ExternalItemStockResult = {
  externalItemId: string;
  name: string;
  stockQty: number;
  deducted: number;
  requested: number;
  insufficient: boolean;
  warning: string | null;
};

type Tx = Prisma.TransactionClient;

async function loadItem(tx: Tx, id: string) {
  const item = await tx.externalItem.findUnique({
    where: { id },
    select: { id: true, name: true, stockQty: true },
  });
  if (!item) {
    throw new Error('Item externo não encontrado.');
  }
  return item;
}

export async function applyExternalItemInbound(
  tx: Tx,
  opts: {
    externalItemId: string;
    quantity: number;
    reference?: string | null;
    notes?: string | null;
    userId?: string | null;
  },
): Promise<ExternalItemStockResult> {
  const qty = Math.trunc(opts.quantity);
  if (!Number.isFinite(qty) || qty < 1) {
    throw new Error('Quantidade de entrada inválida.');
  }
  const item = await loadItem(tx, opts.externalItemId);
  const next = item.stockQty + qty;
  await tx.externalItem.update({
    where: { id: item.id },
    data: { stockQty: next },
  });
  await tx.externalItemStockMovement.create({
    data: {
      id: randomUUID(),
      externalItemId: item.id,
      movementType: 'INBOUND',
      quantity: qty,
      reference: opts.reference?.trim() || null,
      notes: opts.notes?.trim() || null,
      movedById: opts.userId?.trim() || null,
    },
  });
  return {
    externalItemId: item.id,
    name: item.name,
    stockQty: next,
    deducted: 0,
    requested: qty,
    insufficient: false,
    warning: null,
  };
}

/**
 * Baixa estoque de Item Externo na Venda Externa.
 * Se o saldo for menor que a quantidade, desconta o disponível (não negativo)
 * e devolve aviso — o pedido não é bloqueado.
 */
export async function applyExternalItemOutbound(
  tx: Tx,
  opts: {
    externalItemId: string;
    quantity: number;
    reference?: string | null;
    notes?: string | null;
    userId?: string | null;
  },
): Promise<ExternalItemStockResult> {
  const requested = Math.trunc(opts.quantity);
  if (!Number.isFinite(requested) || requested < 1) {
    throw new Error('Quantidade de saída inválida.');
  }
  const item = await loadItem(tx, opts.externalItemId);
  const deducted = Math.min(item.stockQty, requested);
  const next = item.stockQty - deducted;
  const insufficient = deducted < requested;
  if (deducted > 0) {
    await tx.externalItem.update({
      where: { id: item.id },
      data: { stockQty: next },
    });
    await tx.externalItemStockMovement.create({
      data: {
        id: randomUUID(),
        externalItemId: item.id,
        movementType: 'OUTBOUND',
        quantity: deducted,
        reference: opts.reference?.trim() || null,
        notes: opts.notes?.trim() || null,
        movedById: opts.userId?.trim() || null,
      },
    });
  }
  const warning = insufficient
    ? `Saldo insuficiente para “${item.name}”: pedido ${requested}, estoque ${item.stockQty}. Pedido segue mesmo assim.`
    : null;
  return {
    externalItemId: item.id,
    name: item.name,
    stockQty: next,
    deducted,
    requested,
    insufficient,
    warning,
  };
}
