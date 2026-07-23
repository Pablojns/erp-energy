'use client';

import { useEffect } from 'react';
import { Lock } from 'lucide-react';
import { useOrderItemsStock } from '@/src/components/expedicao/shared/use-order-items-stock';
import {
  OrderItemOrderedQtyCell,
  OrderItemStockQtyCell,
} from '@/src/components/expedicao/workspace/order-item-stock-cells';
import { OrderItemReceiptStatusBadge } from '@/src/components/expedicao/workspace/order-item-receipt-status-badge';
import { SeparationItemRow } from '@/src/components/expedicao/workspace/separation-item-row';
import {
  summarizeItemReceiptStatus,
  resolveItemReceiptStatusForOrder,
} from '@/src/components/expedicao/shared/order-helpers';
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
  const isVendaExterna = order.source === 'VENDA_EXTERNA';
  const stockByItemId = useOrderItemsStock(order.items);
  const receiptSummary = summarizeItemReceiptStatus(order.items);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && !isOrdersMode) {
      console.log('itens separacao:', order.items);
    }
  }, [isOrdersMode, order.id, order.items]);

  return (
    <div className="exp-wb-table-wrap">
      <div className="exp-wb-table-head exp-wb-table-head--compact">
        {isOrdersMode ? (
          <span
            className="exp-wb-table-head-lock"
            title="Itens do pedido (somente leitura)"
            aria-label="Itens do pedido (somente leitura)"
          >
            <Lock className="h-3 w-3" aria-hidden />
          </span>
        ) : (
          <h3 className="exp-wb-table-head-title">Itens para separação</h3>
        )}
        {isOrdersMode && receiptSummary.recebidos + receiptSummary.emFalta > 0 ? (
          <p className="exp-wb-item-receipt-summary text-[10px]">
            <span className="exp-wb-item-receipt-summary__recebido">
              {receiptSummary.recebidos} recebido(s)
            </span>
            {' · '}
            <span className="exp-wb-item-receipt-summary__falta">
              {receiptSummary.emFalta} em falta
            </span>
          </p>
        ) : null}
      </div>
      <div className="exp-wb-table-scroll">
        <table
          className={`exp-wb-table exp-wb-table--compact exp-wb-table--mobile-cards w-full table-fixed ${isOrdersMode ? 'exp-wb-table--orders' : 'exp-wb-table--separation'}`}
        >
          <colgroup>
            {isOrdersMode ? (
              <>
                <col className="exp-wb-col-linha" />
                <col className="exp-wb-col-sku" />
                <col className="exp-wb-col-item" />
                <col className="exp-wb-col-qtd-pedida" />
                <col className="exp-wb-col-qtd-sep" />
                <col className="exp-wb-col-qtd-falta" />
                {!isVendaExterna ? <col className="exp-wb-col-qtd-estoque" /> : null}
                {isVendaExterna ? <col /> : null}
                {isVendaExterna ? <col /> : null}
                {!isVendaExterna ? <col className="exp-wb-col-item-status" /> : null}
              </>
            ) : (
              <>
                <col style={{ width: '44px' }} />
                <col style={{ width: '80px' }} />
                <col />
                <col style={{ width: '50px' }} />
                {!isVendaExterna ? <col style={{ width: '90px' }} /> : null}
                <col style={{ width: '80px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '90px' }} />
              </>
            )}
          </colgroup>
          <thead>
            <tr>
              {isOrdersMode ? (
                <>
                  <th>Linha</th>
                  <th>SKU</th>
                  <th>Item</th>
                  <th className="text-center">Qtd</th>
                  <th className="text-center" style={{ whiteSpace: 'nowrap' }}>
                    Qtd Separada
                  </th>
                  <th className="text-center">Falta</th>
                  {!isVendaExterna ? <th className="text-center">Qtd Estoque</th> : null}
                  {isVendaExterna ? <th className="text-center">Preço unit.</th> : null}
                  {isVendaExterna ? <th className="text-center">Total</th> : null}
                  {!isVendaExterna ? <th className="text-center">Status item</th> : null}
                </>
              ) : (
                <>
                  <th style={{ whiteSpace: 'nowrap' }}>Linha</th>
                  <th style={{ whiteSpace: 'nowrap' }}>SKU</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Item</th>
                  <th className="text-center" style={{ whiteSpace: 'nowrap' }}>
                    Qtd
                  </th>
                  {!isVendaExterna ? (
                    <th className="text-center" style={{ whiteSpace: 'nowrap' }}>
                      Qtd Estoque
                    </th>
                  ) : null}
                  <th className="text-center" style={{ whiteSpace: 'nowrap' }}>
                    Qtd Sep.
                  </th>
                  <th className="text-center" style={{ whiteSpace: 'nowrap' }}>
                    Status
                  </th>
                  <th className="text-center" style={{ whiteSpace: 'nowrap' }}>
                    Ação
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => {
              const stock = stockByItemId[it.id] ?? { available: null, loading: true };
              const picked = it.pickedQty ?? 0;
              const missing = Math.max(0, (it.quantity ?? 0) - picked);

              if (!isOrdersMode) {
                return (
                  <SeparationItemRow
                    key={it.id}
                    order={order}
                    item={it}
                    stock={stock}
                    hideStockColumn={isVendaExterna}
                    onConfirmLine={async (qty) => {
                      await data.markLineSeparated(order.id, it.id, qty);
                      onAfterAction?.();
                    }}
                  />
                );
              }

              return (
                <tr key={it.id}>
                  <td className="exp-wb-cell-linha text-xs" data-label="Linha">{it.lineNumber}</td>
                  <td className="exp-wb-cell-sku text-xs" data-label="SKU">{it.sku || '—'}</td>
                  <td className="exp-wb-cell-item text-xs" data-label="Item" title={it.description}>
                    {it.description}
                  </td>
                  <td className="text-center" data-label="Qtd">
                    <OrderItemOrderedQtyCell qty={it.quantity} />
                  </td>
                  <td className="text-center text-xs font-semibold" data-label="Qtd Separada">
                    {picked}
                  </td>
                  <td
                    className={`text-center text-xs font-semibold ${missing > 0 ? 'text-amber-600' : 'text-emerald-600'}`}
                    data-label="Falta"
                  >
                    {missing}
                  </td>
                  {!isVendaExterna ? (
                    <td className="text-center" data-label="Estoque">
                      <OrderItemStockQtyCell orderedQty={it.quantity} stock={stock} />
                    </td>
                  ) : null}
                  {isVendaExterna ? (
                    <td className="text-center text-xs" data-label="Preço unit.">
                      {Number(it.unitPrice).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </td>
                  ) : null}
                  {isVendaExterna ? (
                    <td className="text-center text-xs" data-label="Total">
                      {Number(it.totalPrice).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </td>
                  ) : null}
                  {!isVendaExterna ? (
                    <td className="text-center" data-label="Status item">
                      <OrderItemReceiptStatusBadge
                        status={resolveItemReceiptStatusForOrder(it, order.status)}
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
