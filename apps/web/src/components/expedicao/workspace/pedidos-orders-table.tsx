'use client';

import { useMemo, type ReactNode, type RefObject } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { OrderClickableStatusBadge } from '@/src/components/expedicao/workspace/order-clickable-status-badge';
import {
  displayOrDash,
  formatOrderStatusLabel,
  orderDisplayNumber,
} from '@/src/components/expedicao/shared/order-helpers';
import { TableColumnsPicker } from '@/src/components/shared/table-columns-picker';
import { useTableColumnPreferences } from '@/src/hooks/use-table-column-preferences';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import type { ColumnDefinition } from '@/src/lib/table-column-preferences';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatCurrency(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return brl.format(Number.isFinite(n) ? n : 0);
}

function formatCompactDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatNfDisplay(value: string | null | undefined): string {
  const raw = displayOrDash(value);
  if (raw === '—') return raw;
  return raw.replace(/^NF\s*:?\s*/i, '').trim() || raw;
}

export const PEDIDOS_TABLE_COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: 'pedido', label: 'Nº pedido', required: true },
  { key: 'status', label: 'Status', required: true },
  { key: 'recebedor', label: 'Recebedor' },
  { key: 'pontoDescarga', label: 'Ponto de descarga', defaultVisible: false },
  { key: 'transportadora', label: 'Transportadora', defaultVisible: false },
  { key: 'nf', label: 'NF' },
  { key: 'dataPedido', label: 'Data pedido' },
  { key: 'dataEntrega', label: 'Data entrega', defaultVisible: false },
  { key: 'valor', label: 'Valor' },
];

const PEDIDOS_TABLE_ID = 'expedicao-pedidos';

/** Larguras fixas (px) — colunas opcionais compartilham o espaço restante. */
const FIXED_COL_WIDTH_PX: Partial<Record<string, number>> = {
  pedido: 90,
  status: 110,
  nf: 44,
  dataPedido: 52,
  dataEntrega: 52,
  valor: 72,
};

type PedidosOrdersTableProps = {
  userId: string;
  orders: OrderDto[];
  selectedOrderId: string | null;
  onSelectOrder: (id: string) => void;
  onOrderChosen?: () => void;
  selectedForPrintIds?: Set<string>;
  onTogglePrint?: (orderId: string) => void;
  isAdmin?: boolean;
  onEditOrder?: (order: OrderDto) => void;
  onDeleteOrder?: (order: OrderDto) => void;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  listFooter?: ReactNode;
};

export function PedidosOrdersTable({
  userId,
  orders,
  selectedOrderId,
  onSelectOrder,
  onOrderChosen,
  selectedForPrintIds,
  onTogglePrint,
  isAdmin = false,
  onEditOrder,
  onDeleteOrder,
  scrollContainerRef,
  listFooter,
}: PedidosOrdersTableProps) {
  const columnPrefs = useTableColumnPreferences(
    userId,
    PEDIDOS_TABLE_ID,
    PEDIDOS_TABLE_COLUMN_DEFINITIONS,
  );

  const visibleColumns = useMemo(() => {
    const labelByKey = new Map(
      PEDIDOS_TABLE_COLUMN_DEFINITIONS.map((d) => [d.key, d.label]),
    );
    return columnPrefs.preferences
      .filter((p) => p.visible)
      .map((p) => ({ key: p.key, label: labelByKey.get(p.key) ?? p.key }));
  }, [columnPrefs.preferences]);

  const hasActions = isAdmin && Boolean(onEditOrder || onDeleteOrder);
  const hasCheckbox = Boolean(onTogglePrint);

  const cellValue = (order: OrderDto, key: string): string => {
    switch (key) {
      case 'pedido':
        return orderDisplayNumber(order);
      case 'status':
        return formatOrderStatusLabel(order.status);
      case 'recebedor':
        return displayOrDash(order.receiverName ?? order.customerName);
      case 'pontoDescarga':
        return displayOrDash(order.unloadingPoint);
      case 'transportadora':
        return displayOrDash(order.carrierName);
      case 'nf':
        return formatNfDisplay(order.invoiceNumber);
      case 'dataPedido':
        return formatCompactDate(order.orderDate);
      case 'dataEntrega':
        return formatCompactDate(order.requestedDeliveryDate);
      case 'valor':
        return formatCurrency(order.totalValue);
      default:
        return '—';
    }
  };

  const colAlign = (key: string) => {
    if (key === 'nf') return 'text-center';
    if (key === 'valor') return 'text-right';
    return 'text-left';
  };

  return (
    <div className="exp-pedidos-table-wrap flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="exp-pedidos-table-toolbar">
        <p className="exp-pedidos-table-toolbar-title">Lista de pedidos</p>
        <TableColumnsPicker
          definitions={columnPrefs.definitions}
          preferences={columnPrefs.preferences}
          onToggle={columnPrefs.setVisible}
          onReorder={columnPrefs.reorder}
          onReset={columnPrefs.reset}
          ariaLabel="Configurar colunas da tabela de pedidos"
        />
      </div>

      <div
        ref={scrollContainerRef}
        className="exp-pedidos-table-scroll erp-scrollbar overflow-x-hidden"
      >
        <table className="exp-pedidos-table w-full table-fixed">
          <colgroup>
            {hasCheckbox ? <col style={{ width: '20px' }} /> : null}
            {visibleColumns.map((col) => {
              const fixed = FIXED_COL_WIDTH_PX[col.key];
              if (fixed) {
                return <col key={col.key} style={{ width: `${fixed}px` }} />;
              }
              return <col key={col.key} />;
            })}
            {hasActions ? <col style={{ width: '52px' }} /> : null}
          </colgroup>
          <thead>
            <tr>
              {hasCheckbox ? (
                <th className="exp-pedidos-th exp-pedidos-th--check" scope="col" aria-label="Selecionar" />
              ) : null}
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  className={`exp-pedidos-th ${colAlign(col.key)}`}
                  scope="col"
                  title={col.label}
                >
                  <span className="block truncate">{col.label}</span>
                </th>
              ))}
              {hasActions ? (
                <th className="exp-pedidos-th text-right" scope="col">
                  Ações
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const selected = selectedOrderId === order.id;
              return (
                <tr
                  key={order.id}
                  className={`exp-pedidos-row ${selected ? 'exp-pedidos-row--selected' : ''}`}
                  onClick={() => {
                    onSelectOrder(order.id);
                    onOrderChosen?.();
                  }}
                >
                  {hasCheckbox ? (
                    <td
                      className="exp-pedidos-td exp-pedidos-td--check"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="exp-pedidos-check"
                        checked={selectedForPrintIds?.has(order.id) ?? false}
                        onChange={() => onTogglePrint?.(order.id)}
                        aria-label={`Selecionar pedido ${orderDisplayNumber(order)}`}
                      />
                    </td>
                  ) : null}
                  {visibleColumns.map((col) => (
                    <td
                      key={col.key}
                      className={`exp-pedidos-td ${colAlign(col.key)}`}
                    >
                      {col.key === 'status' ? (
                        <div className="exp-pedidos-status-cell">
                          <OrderClickableStatusBadge order={order} compact />
                        </div>
                      ) : col.key === 'pedido' ? (
                        <span
                          className="exp-pedidos-cell-pedido block truncate"
                          title={cellValue(order, col.key)}
                        >
                          {cellValue(order, col.key)}
                        </span>
                      ) : (
                        <span
                          className={`exp-pedidos-cell-secondary block truncate tabular-nums ${
                            col.key === 'nf' ? 'text-center' : ''
                          }`}
                          title={cellValue(order, col.key)}
                        >
                          {cellValue(order, col.key)}
                        </span>
                      )}
                    </td>
                  ))}
                  {hasActions ? (
                    <td
                      className="exp-pedidos-td text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="exp-pedidos-actions">
                        {onEditOrder ? (
                          <button
                            type="button"
                            className="exp-pedidos-action-btn"
                            aria-label="Editar pedido"
                            onClick={() => onEditOrder(order)}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                        ) : null}
                        {onDeleteOrder ? (
                          <button
                            type="button"
                            className="exp-pedidos-action-btn exp-pedidos-action-btn--danger"
                            aria-label="Excluir pedido"
                            onClick={() => onDeleteOrder(order)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        {listFooter}
      </div>
    </div>
  );
}

export { PEDIDOS_TABLE_ID };
