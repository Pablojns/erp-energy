export type ExitQtyItem = {
  quantity: number;
  pickedQty: number;
  invoicedQty: number;
};

export function resolveExitQuantity(item: ExitQtyItem): number {
  if (item.pickedQty > 0) return item.pickedQty;
  if (item.invoicedQty > 0) return item.invoicedQty;
  return 0;
}

/**
 * Quantidade deste ciclo de saída: separado atual menos o que já saiu
 * (`invoicedQty`). Nunca o total acumulado do pedido.
 */
export function resolveExitPendingQuantity(item: ExitQtyItem): number {
  const target = Math.min(
    Math.max(item.quantity, 0),
    resolveExitQuantity(item),
  );
  return Math.max(0, target - Math.max(0, item.invoicedQty));
}

export function cycleExitQtyFromItems(items: ExitQtyItem[]): number {
  return items.reduce((sum, it) => sum + resolveExitPendingQuantity(it), 0);
}

/**
 * Total já expedido a partir do histórico de NF.
 * Linhas antigas gravavam snapshot cumulativo (60, depois 100).
 * Linhas novas gravam o delta do ciclo (60, depois 40).
 */
export function shippedQtyFromInvoiceHistory(
  rows: Array<{ pickedQtyAtTime: number | null }>,
): number {
  const values = rows.map((r) => Math.max(0, r.pickedQtyAtTime ?? 0));
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0] ?? 0;
  let nonDecreasing = true;
  for (let i = 1; i < values.length; i += 1) {
    if ((values[i] ?? 0) < (values[i - 1] ?? 0)) {
      nonDecreasing = false;
      break;
    }
  }
  if (nonDecreasing) return values[values.length - 1] ?? 0;
  return values.reduce((sum, v) => sum + v, 0);
}

/** Quantidade do ciclo por linha do histórico (delta), na mesma ordem recebida. */
export function cycleQtysFromInvoiceHistory(
  rows: Array<{ pickedQtyAtTime: number | null }>,
): number[] {
  const values = rows.map((r) => Math.max(0, r.pickedQtyAtTime ?? 0));
  if (values.length === 0) return [];
  let nonDecreasing = values.length > 1;
  for (let i = 1; i < values.length; i += 1) {
    if ((values[i] ?? 0) < (values[i - 1] ?? 0)) {
      nonDecreasing = false;
      break;
    }
  }
  if (!nonDecreasing) return values;
  return values.map((v, i) => v - (i === 0 ? 0 : (values[i - 1] ?? 0)));
}
