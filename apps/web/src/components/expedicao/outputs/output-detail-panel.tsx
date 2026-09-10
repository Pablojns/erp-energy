'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { formatBrlDisplay, formatDayDisplay } from '@/src/components/expedicao/expedition-wms-layout';
import type {
  OrderExitDto,
  OrderExitItemDto,
  OrderExitParcelaDto,
} from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { pedidoApiUrl } from '@/src/services/api/pedidos-normalize';

function formatOrderNumber(exitItem: OrderExitDto): string {
  return exitItem.order.externalOrderNumber?.trim()
    ? `#${exitItem.order.externalOrderNumber}`
    : exitItem.order.code;
}

function statusLabel(exitItem: OrderExitDto): string {
  if (exitItem.punctuality === 'LATE' && exitItem.delayedDays > 0) {
    return `ATRASADO ${exitItem.delayedDays} dia${exitItem.delayedDays > 1 ? 's' : ''}`;
  }
  return 'NO PRAZO';
}

function numeroPedFromExit(exitItem: OrderExitDto): string | null {
  const raw = exitItem.order.externalOrderNumber?.trim();
  return raw || null;
}

function sum(nums: number[]): number {
  return nums.reduce((acc, n) => acc + n, 0);
}

function sortedParcelas(
  exit: OrderExitDto,
  fallbackQty: number,
): OrderExitParcelaDto[] {
  const fromApi = [...(exit.parcelas ?? [])].sort((a, b) => {
    const da = new Date(a.exitDate).getTime();
    const db = new Date(b.exitDate).getTime();
    if (da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });
  const parcelas = fromApi.length > 0 ? fromApi : [
    {
      id: exit.id,
      invoiceNumber: exit.invoiceNumber,
      exitDate: exit.exitDate,
      quantity: fallbackQty,
    },
  ];
  return parcelas.map((p) =>
    p.id === exit.id && (p.quantity ?? 0) <= 0
      ? { ...p, quantity: fallbackQty }
      : p,
  );
}

function ItemStatusBadge(props: {
  item: OrderExitItemDto;
  remainingAfterThis: number;
  completedByThis: boolean;
  splitShipment: boolean;
}) {
  const { item, remainingAfterThis, completedByThis, splitShipment } = props;
  const sentThis = item.pickedQty ?? 0;
  const ordered = item.quantity ?? 0;

  if (sentThis <= 0) {
    return (
      <span className="inline-flex rounded-md bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-500">
        NÃO ENVIADO
      </span>
    );
  }

  if (completedByThis) {
    if (splitShipment || sentThis < ordered) {
      return (
        <span className="inline-flex max-w-[18rem] flex-col rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold leading-tight text-emerald-600">
          <span>COMPLETO — parcela final ({sentThis} un.)</span>
          <span className="font-medium">Pedido finalizado</span>
        </span>
      );
    }
    return (
      <span className="inline-flex rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
        COMPLETO
      </span>
    );
  }

  return (
    <span className="inline-flex max-w-[18rem] flex-col rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold leading-tight text-amber-700">
      <span>
        PARCIAL — enviado {sentThis} de {ordered} nesta parcela
      </span>
      <span className="font-medium">Restam {remainingAfterThis} pendentes</span>
    </span>
  );
}

function DetailRow(props: { label: string; value: string | null | undefined }) {
  const { label, value } = props;
  const display = value?.trim() ? value.trim() : '—';
  return (
    <p className="text-sm leading-relaxed">
      <span className="font-medium text-[var(--text-primary)]">{label}:</span>{' '}
      <span className="text-[var(--text-secondary)]">{display}</span>
    </p>
  );
}

export function OutputDetailPanel(props: {
  exit: OrderExitDto;
  canDeleteExit?: boolean;
  onDeleteExit?: () => void;
  onObsExpedicaoSaved?: (value: string | null) => void;
}) {
  const { exit, canDeleteExit, onDeleteExit, onObsExpedicaoSaved } = props;
  const [obsExpedicao, setObsExpedicao] = useState(exit.order.obsExpedicao ?? '');
  const [savingObs, setSavingObs] = useState(false);
  const [obsError, setObsError] = useState<string | null>(null);
  const lastSavedRef = useRef(exit.order.obsExpedicao ?? '');

  useEffect(() => {
    const initial = exit.order.obsExpedicao ?? '';
    setObsExpedicao(initial);
    lastSavedRef.current = initial;
    setObsError(null);
  }, [exit.id, exit.order.obsExpedicao]);

  const exitContext = useMemo(() => {
    const items = exit.order.items ?? [];
    const orderedTotal = sum(items.map((it) => it.quantity ?? 0));
    const thisCycleQty = sum(items.map((it) => it.pickedQty ?? 0));
    const parcelas = sortedParcelas(exit, thisCycleQty);
    const thisIndex = Math.max(
      0,
      parcelas.findIndex((p) => p.id === exit.id),
    );
    const shippedUpToThis = sum(
      parcelas.slice(0, thisIndex + 1).map((p) => p.quantity),
    );
    const shippedTotal = sum(parcelas.map((p) => p.quantity));
    const remainingAfterThis = Math.max(0, orderedTotal - shippedUpToThis);
    const orderFullyShipped =
      exit.order.status === 'FINALIZADO' ||
      (orderedTotal > 0 && shippedTotal >= orderedTotal);
    const isLastParcela = thisIndex === parcelas.length - 1;
    const completedByThis =
      remainingAfterThis <= 0 && (orderFullyShipped || isLastParcela);

    return {
      orderedTotal,
      shippedTotal,
      parcelas,
      remainingAfterThis,
      completedByThis,
      splitShipment: parcelas.length > 1,
    };
  }, [exit]);

  const saveObsExpedicao = async () => {
    const trimmed = obsExpedicao.trim();
    const persisted = trimmed || null;
    const lastPersisted = lastSavedRef.current.trim() || null;
    if (persisted === lastPersisted || savingObs) return;

    const numeroPed = numeroPedFromExit(exit);
    if (!numeroPed) {
      setObsError('Número do pedido inválido para salvar observação.');
      return;
    }

    setSavingObs(true);
    setObsError(null);
    const previous = lastSavedRef.current;

    try {
      await erpFetchJson(pedidoApiUrl(numeroPed, 'status'), {
        method: 'PATCH',
        body: JSON.stringify({ obsExpedicao: trimmed }),
      });
      lastSavedRef.current = trimmed;
      onObsExpedicaoSaved?.(persisted);
    } catch {
      setObsExpedicao(previous);
      setObsError('Não foi possível salvar a observação. Tente novamente.');
    } finally {
      setSavingObs(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-semibold text-[var(--text-primary)]">
            {formatOrderNumber(exit)}
          </p>
          <p className="text-base font-semibold text-[var(--text-primary)]">
            {formatBrlDisplay(exit.invoiceValue)}
          </p>
          <span
            className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
              exit.punctuality === 'LATE'
                ? 'border-red-400/50 bg-red-500/10 text-red-500'
                : 'border-emerald-400/50 bg-emerald-500/10 text-emerald-500'
            }`}
          >
            {statusLabel(exit)}
          </span>
          {canDeleteExit ? (
            <button
              type="button"
              onClick={onDeleteExit}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-500 transition hover:bg-rose-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir saída
            </button>
          ) : null}
        </div>
      </header>

      <div className="space-y-2 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] p-3">
        <DetailRow
          label="Comprador"
          value={
            exit.order.customerDocument
              ? `${exit.order.customerName} (${exit.order.customerDocument})`
              : exit.order.customerName
          }
        />
        <DetailRow label="Nota de Venda" value={exit.invoiceNumber} />
        <DetailRow label="Nota de Remessa" value={exit.order.notaRemessa} />
        <DetailRow
          label="Transportadora"
          value={exit.carrierName ?? exit.order.carrierName}
        />
        <DetailRow
          label="Volumes"
          value={
            exit.order.volumes != null && exit.order.volumes >= 1
              ? String(exit.order.volumes)
              : null
          }
        />
        <DetailRow label="Data" value={formatDayDisplay(exit.exitDate)} />
        {exit.order.notes?.trim() ? (
          <DetailRow label="Obs. WEG" value={exit.order.notes} />
        ) : null}
      </div>

      {exitContext.parcelas.length > 0 ? (
        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
          {exitContext.parcelas.map((parcela, index) => {
            const isCurrent = parcela.id === exit.id;
            const sep =
              index < exitContext.parcelas.length - 1 ? ' · ' : ' — ';
            return (
              <span key={parcela.id}>
                <span
                  className={
                    isCurrent
                      ? 'font-medium text-[var(--text-secondary)]'
                      : undefined
                  }
                >
                  Parcela {index + 1}: {parcela.quantity} un. em{' '}
                  {formatDayDisplay(parcela.exitDate)}
                </span>
                {sep}
              </span>
            );
          })}
          <span>
            Total: {exitContext.shippedTotal}/{exitContext.orderedTotal}
          </span>
        </p>
      ) : null}

      <div className="rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] p-3">
        <label
          htmlFor="obs-expedicao"
          className="mb-2 block text-sm font-medium text-[var(--text-primary)]"
        >
          Observação da expedição
        </label>
        <textarea
          id="obs-expedicao"
          value={obsExpedicao}
          onChange={(e) => {
            setObsExpedicao(e.target.value);
            setObsError(null);
          }}
          onBlur={() => void saveObsExpedicao()}
          disabled={savingObs}
          rows={3}
          placeholder="Adicionar observação da expedição..."
          className="w-full resize-y rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
        />
        <div className="mt-1.5 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          {savingObs ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Salvando...
            </>
          ) : obsError ? (
            <span className="text-red-500">{obsError}</span>
          ) : (
            <span>Salva automaticamente ao sair do campo.</span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border-color)]">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-[var(--input-bg)]">
              {['LINHA', 'SKU', 'ITEM (DESCRIÇÃO)', 'QTD. ENVIADA', 'STATUS'].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {exit.order.items.map((it) => {
              const sentThis = it.pickedQty ?? 0;
              const ordered = it.quantity ?? 0;
              const lineComplete =
                (ordered > 0 && sentThis >= ordered) ||
                exitContext.completedByThis;
              const remainingItem =
                ordered > 0 && sentThis >= ordered
                  ? 0
                  : exitContext.remainingAfterThis;
              return (
              <tr key={it.id} className="border-t border-[var(--border-color)]">
                <td className="px-3 py-2 text-xs text-[var(--text-primary)]">{it.lineNumber}</td>
                <td className="px-3 py-2 text-xs font-mono text-[var(--text-primary)]">{it.sku}</td>
                <td className="px-3 py-2 text-xs text-[var(--text-primary)]">{it.description}</td>
                <td className="px-3 py-2 text-center">
                  <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-[var(--input-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--text-primary)]">
                    {it.pickedQty ?? 0}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <ItemStatusBadge
                    item={it}
                    remainingAfterThis={remainingItem}
                    completedByThis={lineComplete}
                    splitShipment={exitContext.splitShipment}
                  />
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
