'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { formatBrlDisplay, formatDayDisplay } from '@/src/components/expedicao/expedition-wms-layout';
import type { OrderExitDto, OrderExitItemDto } from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

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

function numeroPedFromExit(exitItem: OrderExitDto): number | null {
  const raw = exitItem.order.externalOrderNumber?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
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

function ItemStatusBadge(props: { item: OrderExitItemDto }) {
  const { item } = props;
  const picked = item.pickedQty ?? 0;
  const ordered = item.quantity ?? 0;

  if (picked === 0) {
    return (
      <span className="inline-flex rounded-md bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-500">
        NÃO ENVIADO
      </span>
    );
  }

  if (picked === ordered && ordered > 0) {
    return (
      <span className="inline-flex rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
        COMPLETO
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
      PARCIAL ({picked} de {ordered})
    </span>
  );
}

export function OutputDetailPanel(props: {
  exit: OrderExitDto;
  onObsExpedicaoSaved?: (value: string | null) => void;
}) {
  const { exit, onObsExpedicaoSaved } = props;
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
      await erpFetchJson(`api/pedidos/${numeroPed}/status`, {
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
            {exit.order.items.map((it) => (
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
                  <ItemStatusBadge item={it} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
