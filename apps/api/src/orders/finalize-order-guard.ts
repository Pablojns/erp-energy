import { BadRequestException } from '@nestjs/common';
import { Prisma, StockMovementType } from '@erp/database';
import {
  allLinesReceivedForFinalize,
  finalizeNotAllReceivedMessage,
} from './pedidos-import';

export type FinalizeGuardItem = {
  sku: string;
  quantity: number;
  invoicedQty: number;
  productId: string | null;
};

export type FinalizeGuardMovement = {
  productId: string;
  quantity: number;
};

export const FINALIZE_NF_MISSING =
  'Não é possível finalizar: NF não vinculada';

export function invoicedQtyMismatchMessage(
  sku: string,
  ordered: number,
  invoiced: number,
): string {
  return `Não é possível finalizar: item SKU ${sku} tem ${ordered} unidades pedidas mas só ${invoiced} faturadas`;
}

export function stockQtyMismatchMessage(
  sku: string,
  ordered: number,
  moved: number,
): string {
  return `Não é possível finalizar: item SKU ${sku} tem ${ordered} unidades pedidas mas só ${moved} baixadas do estoque`;
}

export function validateFinalizeOrder(input: {
  invoiceNumber: string | null | undefined;
  items: FinalizeGuardItem[];
  movements: FinalizeGuardMovement[];
}): { ok: true } | { ok: false; message: string; critical: boolean } {
  if (!input.invoiceNumber?.trim()) {
    return { ok: false, message: FINALIZE_NF_MISSING, critical: false };
  }

  for (const it of input.items) {
    if (it.quantity <= 0) continue;
    const invoiced = Math.max(0, it.invoicedQty ?? 0);
    if (invoiced !== it.quantity) {
      return {
        ok: false,
        message: invoicedQtyMismatchMessage(it.sku, it.quantity, invoiced),
        critical: false,
      };
    }
  }

  const movedByProduct = new Map<string, number>();
  for (const m of input.movements) {
    movedByProduct.set(
      m.productId,
      (movedByProduct.get(m.productId) ?? 0) + Math.max(0, m.quantity),
    );
  }

  const expectedByProduct = new Map<string, { qty: number; sku: string }>();
  for (const it of input.items) {
    if (it.quantity <= 0) continue;
    if (!it.productId) {
      return {
        ok: false,
        message: stockQtyMismatchMessage(it.sku, it.quantity, 0),
        critical: true,
      };
    }
    const prev = expectedByProduct.get(it.productId);
    if (prev) {
      prev.qty += it.quantity;
    } else {
      expectedByProduct.set(it.productId, {
        qty: it.quantity,
        sku: it.sku,
      });
    }
  }

  for (const [productId, expected] of expectedByProduct) {
    const moved = movedByProduct.get(productId) ?? 0;
    if (moved < expected.qty) {
      return {
        ok: false,
        message: stockQtyMismatchMessage(expected.sku, expected.qty, moved),
        critical: true,
      };
    }
  }

  return { ok: true };
}

export function orderSaidaExpedicaoWhere(order: {
  code: string;
  externalOrderNumber: string | null;
  invoiceNumber: string | null;
}): Prisma.StockMovementWhereInput {
  const refs = new Set<string>([order.code]);
  const ext = order.externalOrderNumber?.trim();
  if (ext) refs.add(ext);
  const inv = order.invoiceNumber?.trim();
  if (inv) refs.add(inv);

  const or: Prisma.StockMovementWhereInput[] = [
    { reference: { in: [...refs] } },
    { notes: { contains: order.code, mode: 'insensitive' } },
  ];
  if (ext) {
    or.push({ notes: { contains: ext, mode: 'insensitive' } });
  }
  if (inv) {
    or.push({ invoiceNumber: inv });
  }
  return {
    AND: [{ OR: or }, { movementType: StockMovementType.SAIDA_EXPEDICAO }],
  };
}

type FinalizeGuardTx = {
  orderItem: {
    findMany: (args: {
      where: { orderId: string };
      select: {
        sku: true;
        mercadoEletronicoItemStatus: true;
      };
    }) => Promise<
      Array<{ sku: string; mercadoEletronicoItemStatus: string | null }>
    >;
  };
};

/**
 * Trava de FINALIZADO: todas as linhas Recebido/OK.
 * invoicedQty e SAIDA_EXPEDICAO não bloqueiam — o status da linha é a fonte de verdade.
 */
export async function assertCanFinalizeOrder(
  tx: FinalizeGuardTx,
  order: {
    id: string;
    code: string;
    externalOrderNumber: string | null;
    invoiceNumber: string | null;
  },
  _onCritical?: (message: string) => void,
): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId: order.id },
    select: {
      sku: true,
      mercadoEletronicoItemStatus: true,
    },
  });
  if (allLinesReceivedForFinalize(items)) return;
  throw new BadRequestException(finalizeNotAllReceivedMessage(items));
}
