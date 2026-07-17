'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Truck } from 'lucide-react';
import { generateUUID } from '@/src/lib/uuid';
import type { OrderExitDto, PaginatedOrderExits } from '@/src/components/expedicao/shared/types';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { EmptyState } from '@/src/components/ui/empty-state';
import { TableSkeleton } from '@/src/components/ui/skeleton';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { pedidosListFetchInit } from '@/src/services/api/pedidos-normalize';

function isSaoMiguelCarrier(name: string | null | undefined): boolean {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .includes('sao miguel');
}

function orderNumber(exit: OrderExitDto): string {
  return exit.order.externalOrderNumber?.trim() || exit.order.code;
}

function receiverName(exit: OrderExitDto): string {
  return exit.order.receiverName?.trim() || exit.order.customerName?.trim() || '—';
}

function cityState(exit: OrderExitDto): string {
  const city = exit.order.deliveryCity?.trim() || '';
  const state = exit.order.deliveryState?.trim() || '';
  return [city, state].filter(Boolean).join('/') || '—';
}

function volumesLabel(exit: OrderExitDto): string {
  const volumes = exit.order.volumes;
  return volumes != null && volumes >= 1 ? String(volumes) : '—';
}

function nestErrorMessage(payload: unknown, fallbackStatus: number): string {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('message' in payload) ||
    payload.message === undefined
  ) {
    return `Erro HTTP ${fallbackStatus}`;
  }
  const raw = payload.message;
  if (Array.isArray(raw)) {
    return raw.map((part) => String(part)).join(' · ');
  }
  return String(raw);
}

async function fetchRomaneioExits(): Promise<OrderExitDto[]> {
  const allExits: OrderExitDto[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const res = await erpFetchJson<PaginatedOrderExits>(
      `api/pedidos/saidas?period=all&page=${page}&pageSize=100`,
      pedidosListFetchInit,
    );
    allExits.push(...(res.data ?? []));
    totalPages = res.meta?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages);

  return allExits.filter((exit) => {
    const status = exit.order.status;
    // FINALIZADO ou PARCIAL com saída já registrada (OrderExit)
    const eligibleStatus = status === 'FINALIZADO' || status === 'PARCIAL';
    return (
      eligibleStatus &&
      isSaoMiguelCarrier(exit.carrierName ?? exit.order.carrierName)
    );
  });
}

async function postRomaneioPdf(orderIds: string[]): Promise<Blob> {
  const res = await fetch('/api/erp/pedidos/romaneio', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-request-id': generateUUID(),
    },
    body: JSON.stringify({ orderIds }),
  });

  if (!res.ok) {
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = { message: text };
      }
    }
    throw new Error(nestErrorMessage(body, res.status));
  }

  return res.blob();
}

export function RomaneioPage() {
  const [exits, setExits] = useState<OrderExitDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const loadExits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchRomaneioExits();
      setExits(rows);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar romaneio.');
      setExits([]);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExits();
  }, [loadExits]);

  const pendingExits = useMemo(
    () => exits.filter((exit) => !exit.romaneioAt),
    [exits],
  );

  const selectedCount = selectedIds.size;

  const toggleOne = (orderId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (selectedIds.size === 0) return;
    setGenerating(true);
    setError(null);
    try {
      const blob = await postRomaneioPdf([...selectedIds]);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      await loadExits();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar romaneio.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex h-[calc(100dvh-11.5rem)] min-h-0 w-full flex-col gap-3 overflow-hidden px-2 pt-2 pb-2 sm:px-4 max-lg:h-[calc(100dvh-14.5rem)]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="erp-module-title erp-text-lg">Romaneio</h1>
          <p className="erp-module-subtitle erp-text-xs">
            Pedidos finalizados com saída — Transportadora São Miguel
          </p>
        </div>
        <button
          type="button"
          disabled={generating || loading || selectedCount === 0}
          onClick={() => void handleGenerate()}
          className="erp-focus-ring erp-btn erp-btn-primary erp-btn--md disabled:opacity-60"
        >
          {generating ? <Loader2 className="erp-icon-sm animate-spin" /> : <FileText className="erp-icon-sm" />}
          Gerar Romaneio
        </button>
      </div>

      {error ? (
        <p className="erp-alert-danger shrink-0">{error}</p>
      ) : null}

      <section className="erp-module-card lista-container erp-scrollbar">
        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={6} columns={6} />
          </div>
        ) : exits.length === 0 ? (
          <div className="p-4">
            <EmptyState
              compact
              icon={Truck}
              title="Nenhum pedido para romaneio"
              description="Pedidos finalizados ou parciais com saída para São Miguel aparecerão aqui para geração do romaneio."
            />
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-[var(--erp-bg-muted)] text-left">
              <tr>
                <th className="erp-label-caps w-10 px-4 py-3" />
                <th className="erp-label-caps px-4 py-3">Nº Pedido</th>
                <th className="erp-label-caps px-4 py-3">Recebedor</th>
                <th className="erp-label-caps px-4 py-3">Cidade/Estado</th>
                <th className="erp-label-caps px-4 py-3">Volumes</th>
                <th className="erp-label-caps px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {exits.map((exit) => {
                const generated = Boolean(exit.romaneioAt);
                const checked = selectedIds.has(exit.orderId);
                return (
                  <tr key={exit.id} className="border-t border-[var(--border-color)]">
                    <td className="px-4 py-3">
                      {!generated ? (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(exit.orderId)}
                          className="rounded border-[var(--border-color)]"
                          aria-label={`Selecionar pedido ${orderNumber(exit)}`}
                        />
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                      {orderNumber(exit)}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">{receiverName(exit)}</td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">{cityState(exit)}</td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">{volumesLabel(exit)}</td>
                    <td className="px-4 py-3">
                      {generated ? (
                        <StatusBadge label="Romaneio gerado" tone="success" />
                      ) : (
                        <StatusBadge label="Pendente" tone="neutral" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {!loading && pendingExits.length > 0 ? (
        <p className="shrink-0 text-xs text-[var(--text-secondary)]">
          {selectedCount} de {pendingExits.length} pedido(s) pendente(s) selecionado(s)
        </p>
      ) : null}
    </div>
  );
}
