'use client';

import { getItemReceiptStatusVisual } from '@/src/components/expedicao/shared/order-helpers';

export function OrderItemReceiptStatusBadge(props: {
  status: string | null | undefined;
}) {
  const visual = getItemReceiptStatusVisual(props.status);
  if (visual.tone === 'unknown' && visual.label === '—') {
    return <span className="text-[var(--text-muted)]">—</span>;
  }

  return (
    <span
      className={`exp-wb-line-status exp-wb-line-status--${visual.tone}`}
      title={props.status ?? undefined}
    >
      {visual.label}
    </span>
  );
}
