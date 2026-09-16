'use client';

export type OrderItemOrigin = 'WEG' | 'Externo';

export function orderItemOrigin(item: {
  productId?: string | null;
  externalItemId?: string | null;
}): OrderItemOrigin | null {
  if (item.externalItemId) return 'Externo';
  if (item.productId) return 'WEG';
  return null;
}

export function OrderItemOriginBadge(props: {
  origin: OrderItemOrigin | null;
  className?: string;
}) {
  const { origin, className } = props;
  if (!origin) return null;
  const isExt = origin === 'Externo';
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        isExt
          ? 'bg-amber-100 text-amber-800'
          : 'bg-sky-100 text-sky-800'
      }${className ? ` ${className}` : ''}`}
    >
      {origin}
    </span>
  );
}
