import { OrderItemStockStatus, OrderStatus, StockMovementType } from '@erp/database';

/** Cliente de transação Prisma (tipagem frouxa para helpers compartilhados). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StockReservationTx = any;

export function orderNumberFromOrder(order: {
  code: string;
  externalOrderNumber?: string | null;
}): string {
  const ext = order.externalOrderNumber?.trim();
  return ext || order.code;
}

/** Cria ou reativa reserva da linha (única por orderItemId). */
export async function upsertStockReservation(
  tx: StockReservationTx,
  data: {
    orderId: string;
    orderItemId: string;
    productId: string;
    sku: string;
    quantity: number;
    orderNumber: string;
    createdById: string | null;
  },
) {
  const now = new Date();
  await tx.stockReservation.upsert({
    where: { orderItemId: data.orderItemId },
    create: {
      orderId: data.orderId,
      orderItemId: data.orderItemId,
      productId: data.productId,
      sku: data.sku,
      quantity: data.quantity,
      orderNumber: data.orderNumber,
      createdById: data.createdById,
      releasedAt: null,
    },
    update: {
      orderId: data.orderId,
      productId: data.productId,
      sku: data.sku,
      quantity: data.quantity,
      orderNumber: data.orderNumber,
      createdById: data.createdById,
      releasedAt: null,
      createdAt: now,
    },
  });
}

/** Libera reserva ativa da linha (histórico com releasedAt). */
export async function markStockReservationReleased(
  tx: StockReservationTx,
  reservationId: string,
) {
  await tx.stockReservation.update({
    where: { id: reservationId },
    data: { releasedAt: new Date() },
  });
}

export async function markOrderItemReservationReleased(
  tx: StockReservationTx,
  orderItemId: string,
) {
  await tx.stockReservation.updateMany({
    where: { orderItemId, releasedAt: null },
    data: { releasedAt: new Date() },
  });
}

export async function findActiveReservationByOrderItem(
  tx: StockReservationTx,
  orderItemId: string,
): Promise<{
  id: string;
  quantity: number;
  releasedAt: Date | null;
  productId: string;
  sku: string;
} | null> {
  const row = await tx.stockReservation.findUnique({
    where: { orderItemId },
  });
  if (!row || row.releasedAt) return null;
  return row;
}

/**
 * Após entrada física, reserva automaticamente itens em EM_SEPARACAO do mesmo
 * produto que ainda estão sem cobertura — mais antigo primeiro.
 */
export async function allocateInboundToPendingSeparation(
  tx: StockReservationTx,
  productId: string,
  userId: string,
): Promise<void> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      sku: true,
      stockQty: true,
      reservedQty: true,
      isActive: true,
    },
  });
  if (!product?.isActive) return;

  let available = Math.max(0, product.stockQty - product.reservedQty);
  if (available <= 0) return;

  const sku = product.sku.trim();
  const items = await tx.orderItem.findMany({
    where: {
      order: { status: OrderStatus.EM_SEPARACAO },
      OR: [
        { productId },
        ...(sku
          ? [{ sku: { equals: sku, mode: 'insensitive' as const } }]
          : []),
      ],
    },
    select: {
      id: true,
      orderId: true,
      productId: true,
      sku: true,
      quantity: true,
      reservedQuantity: true,
      invoicedQty: true,
      missingQty: true,
      order: {
        select: {
          id: true,
          code: true,
          externalOrderNumber: true,
          createdAt: true,
          sentToSeparationAt: true,
        },
      },
      stockReservation: {
        select: { id: true, quantity: true, releasedAt: true },
      },
    },
  });

  items.sort(
    (
      a: { order: { sentToSeparationAt: Date | null; createdAt: Date } },
      b: { order: { sentToSeparationAt: Date | null; createdAt: Date } },
    ) => {
    const ta =
      a.order.sentToSeparationAt?.getTime() ?? a.order.createdAt.getTime();
    const tb =
      b.order.sentToSeparationAt?.getTime() ?? b.order.createdAt.getTime();
    return ta - tb;
  });

  for (const item of items) {
    if (available <= 0) break;

    const need = Math.max(0, item.quantity - Math.max(0, item.invoicedQty));
    const activeRes =
      item.stockReservation && !item.stockReservation.releasedAt
        ? item.stockReservation.quantity
        : 0;
    const already = Math.max(activeRes, item.reservedQuantity);
    const gap = Math.max(0, need - already);
    if (gap <= 0) continue;

    const take = Math.min(gap, available);
    if (take <= 0) continue;

    const nextReserved = already + take;
    const nextMissing = Math.max(0, need - nextReserved);
    available -= take;

    await tx.product.update({
      where: { id: product.id },
      data: { reservedQty: { increment: take } },
    });

    await tx.orderItem.update({
      where: { id: item.id },
      data: {
        productId: product.id,
        reservedQuantity: nextReserved,
        missingQty: nextMissing,
        stockStatus:
          nextMissing <= 0
            ? OrderItemStockStatus.COMPLETO
            : OrderItemStockStatus.PARCIAL,
      },
    });

    const orderNumber = orderNumberFromOrder(item.order);
    await upsertStockReservation(tx, {
      orderId: item.orderId,
      orderItemId: item.id,
      productId: product.id,
      sku: item.sku.trim() || product.sku,
      quantity: nextReserved,
      orderNumber,
      createdById: userId,
    });

    await tx.stockMovement.create({
      data: {
        productId: product.id,
        movementType: StockMovementType.RESERVA,
        quantity: take,
        reference: orderNumber,
        notes: `Reserva automática após entrada (${orderNumber})`,
        movedById: userId,
      },
    });
  }
}
