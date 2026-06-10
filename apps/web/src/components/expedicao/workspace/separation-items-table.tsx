'use client';

import { getItemSeparationStatus } from '@/src/components/expedicao/shared/order-helpers';
import { SeparationItemRow } from '@/src/components/expedicao/workspace/separation-item-row';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import type { useExpeditionPedidosBridge } from '@/src/hooks/useExpeditionPedidosBridge';

type OrdersData = ReturnType<typeof useExpeditionPedidosBridge>;

export function SeparationItemsTable(props: {
  order: OrderDto;
  data: OrdersData;
  mode?: 'orders' | 'separation';
  onAfterAction?: () => void;
}) {
  const { order, data, mode = 'separation', onAfterAction } = props;
  const isOrdersMode = mode === 'orders';

  function observationForItem(it: OrderDto['items'][number]) {
    const picked = it.pickedQty ?? 0;
    if (picked >= it.quantity) {
      return { label: '✓ Enviado', cls: 'exp-item-badge--ok' };
    }
    if (picked > 0) {
      return { label: '~ Parcial', cls: 'exp-item-badge--warn' };
    }
    return { label: '● Não enviado', cls: 'exp-item-badge--stock' };
  }

  return (
    <div className="exp-wb-table-wrap">
      <div className="exp-wb-table-head">
        <h3>{isOrdersMode ? 'Itens do pedido (leitura)' : 'Itens para separação'}</h3>
      </div>
      <div className="exp-wb-table-scroll">
        <table className="exp-wb-table">
          <colgroup>
            <col style={{ width: '56px' }} />
            <col style={{ width: '120px' }} />
            <col />
            <col style={{ width: '92px' }} />
            {!isOrdersMode ? <col style={{ width: '98px' }} /> : null}
            {!isOrdersMode ? <col style={{ width: '52px' }} /> : null}
            {!isOrdersMode ? <col style={{ width: '110px' }} /> : null}
            <col style={{ width: '92px' }} />
            {isOrdersMode ? <col style={{ width: '130px' }} /> : null}
          </colgroup>
          <thead>
            <tr>
              <th className="overflow-hidden text-ellipsis whitespace-nowrap">Linha</th>
              <th className="overflow-hidden text-ellipsis whitespace-nowrap">SKU</th>
              <th className="overflow-hidden text-ellipsis whitespace-nowrap">
                Item (descrição)
              </th>
              <th className="overflow-hidden text-center text-ellipsis whitespace-nowrap">
                Qtd. pedida
              </th>
              {!isOrdersMode ? (
                <th className="overflow-hidden text-center text-ellipsis whitespace-nowrap">
                  Qtd. separada
                </th>
              ) : null}
              {!isOrdersMode ? (
                <th className="overflow-hidden text-center text-ellipsis whitespace-nowrap">
                  [ ]
                </th>
              ) : null}
              {!isOrdersMode ? (
                <th className="overflow-hidden px-[6px] py-[4px] text-center text-ellipsis whitespace-nowrap">
                  Ação
                </th>
              ) : null}
              <th className="overflow-hidden px-[6px] py-[4px] text-center text-ellipsis whitespace-nowrap">
                Status
              </th>
              {isOrdersMode ? (
                <th className="overflow-hidden text-ellipsis whitespace-nowrap">
                  Observação do item
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => {
              if (!isOrdersMode) {
                return (
                  <SeparationItemRow
                    key={it.id}
                    order={order}
                    item={it}
                    onConfirmLine={async (qty) => {
                      await data.markLineSeparated(order.id, it.id, qty);
                      onAfterAction?.();
                    }}
                  />
                );
              }

              const note = observationForItem(it);
              const st = getItemSeparationStatus(it);
              const statusClass =
                st.tone === 'complete'
                  ? 'exp-item-badge--ok'
                  : st.tone === 'partial'
                    ? 'exp-item-badge--warn'
                    : st.tone === 'nostock'
                      ? 'exp-item-badge--late'
                      : 'exp-item-badge--pending';
              return (
                <tr key={it.id}>
                  <td className="font-mono text-[12px] text-[var(--exp-text-muted)]">
                    {it.lineNumber}
                  </td>
                  <td className="font-mono text-[12px] font-semibold">{it.sku}</td>
                  <td className="max-w-[260px] text-[13px]">{it.description}</td>
                  <td className="text-center font-mono font-semibold">{it.quantity}</td>
                  <td>
                    <span className={`exp-item-badge ${statusClass}`}>
                      {st.label.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span className={`exp-item-badge ${note.cls}`}>{note.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
