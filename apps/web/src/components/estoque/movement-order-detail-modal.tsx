'use client';

import { Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatBrlDisplay, formatDayDisplay } from '@/src/components/expedicao/expedition-wms-layout';
import { formatDeliveryAddressDisplay } from '@/src/components/cadastros/delivery-address';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

const MOVEMENT_LABEL: Record<string, string> = {
  INBOUND: 'Entrada',
  OUTBOUND: 'Saída',
  ADJUSTMENT: 'Ajuste',
  AJUSTE_QUANTIDADE: 'Ajuste quantidade',
  AJUSTE_PRECO_VENDA: 'Ajuste preço venda',
  AJUSTE_PRECO_BASE: 'Ajuste preço base',
  RETURN: 'Devolução',
  RESERVE: 'Reserva',
  RESERVE_CANCEL: 'Cancel. reserva',
  RESERVA: 'Reserva expedição',
  BAIXA_EXPEDICAO: 'Baixa expedição',
  SAIDA_EXPEDICAO: 'Saída expedição (NF)',
};

type MovementDetailResponse = {
  movement: {
    id: string;
    movementType: string;
    quantity: number;
    reference: string | null;
    invoiceNumber: string | null;
    notes: string | null;
    movementDate: string;
    product: { name: string; sku: string };
    movedBy: { name: string } | null;
  };
  parsed: { orderLabel: string | null; invoiceLabel: string | null };
  order: {
    displayNumber?: string;
    code: string;
    externalOrderNumber: string | null;
    status: string;
    customerName: string;
    customerDocument: string | null;
    receiverName: string | null;
    unloadingPoint: string | null;
    deliveryCnpj: string | null;
    deliveryAddress: unknown;
    notes: string | null;
    notaRemessa: string | null;
    carrierName: string | null;
    invoiceNumber: string | null;
    volumes: number | null;
    requestedDeliveryDate: string | null;
  } | null;
  relatedMovements: Array<{
    id: string;
    movementType: string;
    quantity: number;
    movementDate: string;
    productSku: string;
    productName: string;
  }>;
};

function DetailRow(props: { label: string; value: string | null | undefined }) {
  const display = props.value?.trim() ? props.value.trim() : '—';
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <span className="shrink-0 text-xs font-medium text-[var(--text-secondary)]">
        {props.label}:
      </span>
      <span className="text-xs text-[var(--text-primary)]">{display}</span>
    </div>
  );
}

function parsePriceChangeLabel(
  reference: string | null | undefined,
  movementType: string,
): string | null {
  if (
    !reference?.includes('|') ||
    (movementType !== 'AJUSTE_PRECO_VENDA' &&
      movementType !== 'AJUSTE_PRECO_BASE')
  ) {
    return null;
  }
  const [from, to] = reference.split('|');
  if (!from || !to) return null;
  return `De ${formatBrlDisplay(from)} para ${formatBrlDisplay(to)}`;
}

export function MovementOrderDetailModal(props: {
  movementId: string | null;
  onClose: () => void;
}) {
  const { movementId, onClose } = props;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MovementDetailResponse | null>(null);

  useEffect(() => {
    if (!movementId) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void erpFetchJson<MovementDetailResponse>(`stock/movements/${movementId}/detail`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Falha ao carregar detalhes.');
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [movementId]);

  if (!movementId) return null;

  const movement = data?.movement;
  const order = data?.order;
  const orderNumber =
    order?.displayNumber ||
    order?.externalOrderNumber?.trim() ||
    order?.code ||
    data?.parsed.orderLabel ||
    null;
  const invoiceNumber =
    order?.invoiceNumber?.trim() ||
    data?.parsed.invoiceLabel ||
    movement?.invoiceNumber?.trim() ||
    movement?.reference?.trim() ||
    null;
  const priceChangeLabel = movement
    ? parsePriceChangeLabel(movement.reference, movement.movementType)
    : null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="movement-detail-title"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <div>
            <h2 id="movement-detail-title" className="text-sm font-semibold text-[var(--text-primary)]">
              Detalhes da movimentação
            </h2>
            {movement ? (
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                {MOVEMENT_LABEL[movement.movementType] ?? movement.movementType}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--input-bg)]"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="erp-scrollbar flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-[var(--text-secondary)]">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando...
            </div>
          ) : error ? (
            <p className="py-8 text-center text-xs text-red-400">{error}</p>
          ) : movement ? (
            <div className="space-y-3">
              {order ? (
                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] p-3 space-y-2">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    Pedido #{orderNumber}
                  </p>
                  <DetailRow label="Status" value={order.status} />
                  <DetailRow label="Nota fiscal (NF)" value={invoiceNumber} />
                  <DetailRow label="Nota remessa" value={order.notaRemessa} />
                  <DetailRow
                    label="Comprador"
                    value={
                      order.customerDocument
                        ? `${order.customerName} (${order.customerDocument})`
                        : order.customerName
                    }
                  />
                  <DetailRow label="Recebedor" value={order.receiverName} />
                  <DetailRow label="Ponto de descarga" value={order.unloadingPoint} />
                  <DetailRow
                    label="Endereço"
                    value={formatDeliveryAddressDisplay(
                      order.deliveryAddress as string | Record<string, unknown> | null,
                    )}
                  />
                  <DetailRow label="CNPJ entrega" value={order.deliveryCnpj} />
                  <DetailRow label="Transportadora" value={order.carrierName} />
                  <DetailRow
                    label="Volumes"
                    value={
                      order.volumes != null && order.volumes >= 1
                        ? String(order.volumes)
                        : null
                    }
                  />
                  <DetailRow
                    label="Entrega prevista"
                    value={
                      order.requestedDeliveryDate
                        ? formatDayDisplay(order.requestedDeliveryDate)
                        : null
                    }
                  />
                  {order.notes?.trim() ? (
                    <DetailRow label="Obs. pedido" value={order.notes} />
                  ) : null}
                </div>
              ) : orderNumber || invoiceNumber ? (
                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] p-3 space-y-2">
                  {orderNumber ? (
                    <DetailRow label="Pedido" value={orderNumber} />
                  ) : null}
                  {invoiceNumber ? (
                    <DetailRow label="Nota fiscal (NF)" value={invoiceNumber} />
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  Esta movimentação
                </p>
                <DetailRow
                  label="Produto"
                  value={`${movement.product.name} (${movement.product.sku})`}
                />
                <DetailRow label="Quantidade" value={String(movement.quantity)} />
                {priceChangeLabel ? (
                  <DetailRow label="Alteração de preço" value={priceChangeLabel} />
                ) : null}
                <DetailRow label="Responsável" value={movement.movedBy?.name ?? '—'} />
                {movement.notes?.trim() ? (
                  <DetailRow label="Observação" value={movement.notes} />
                ) : null}
              </div>

              {data && data.relatedMovements.length > 1 ? (
                <div className="overflow-x-auto rounded-lg border border-[var(--border-color)]">
                  <table className="min-w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-[var(--input-bg)] text-left text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                        {['Tipo', 'SKU', 'Produto', 'Qtd'].map((h) => (
                          <th key={h} className="px-2 py-1.5">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.relatedMovements.map((m) => (
                        <tr
                          key={m.id}
                          className={`border-t border-[var(--border-color)] ${
                            m.id === movement.id ? 'bg-[var(--accent)]/10' : ''
                          }`}
                        >
                          <td className="px-2 py-1.5">
                            {MOVEMENT_LABEL[m.movementType] ?? m.movementType}
                          </td>
                          <td className="px-2 py-1.5 font-mono">{m.productSku}</td>
                          <td className="px-2 py-1.5">{m.productName}</td>
                          <td className="px-2 py-1.5 text-center font-semibold">
                            {m.quantity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
