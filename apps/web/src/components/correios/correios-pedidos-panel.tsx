'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, PackageSearch, RefreshCw } from 'lucide-react';
import { fetchComprovanteEntregaBlob, rastrearCorreiosLote } from '@/src/services/api/correios-api';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import {
  normalizePedidoFromApi,
  pedidosListFetchInit,
} from '@/src/services/api/pedidos-normalize';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import { orderDisplayNumber } from '@/src/components/expedicao/shared/order-helpers';
import {
  extractTrackingObjetos,
  isTrackingStatusEntregue,
  latestTrackingDescription,
  normalizeTrackingCode,
  type TrackedOrderRow,
} from '@/src/components/correios/correios-helpers';

export function CorreiosPedidosPanel() {
  const [pedidos, setPedidos] = useState<TrackedOrderRow[]>([]);
  const [pedidosLoading, setPedidosLoading] = useState(false);
  const [pedidosErro, setPedidosErro] = useState<string | null>(null);
  const [atualizandoStatus, setAtualizandoStatus] = useState(false);
  const [comprovantePedidoId, setComprovantePedidoId] = useState<string | null>(null);
  const [comprovanteModal, setComprovanteModal] = useState<{
    codigo: string;
    url: string;
    isPdf: boolean;
  } | null>(null);

  const applyTrackingStatuses = useCallback(
    async (rows: TrackedOrderRow[]): Promise<TrackedOrderRow[]> => {
      const codigos = [
        ...new Set(
          rows
            .map((p) => normalizeTrackingCode(p.trackingCode))
            .filter(Boolean),
        ),
      ];
      if (codigos.length === 0) return rows;

      const statusByCode = new Map<string, string>();
      const chunkSize = 20;
      const errors: string[] = [];

      for (let i = 0; i < codigos.length; i += chunkSize) {
        const chunk = codigos.slice(i, i + chunkSize);
        try {
          const data = await rastrearCorreiosLote(chunk);
          const objetos = extractTrackingObjetos(data);

          for (const objeto of objetos) {
            if (!objeto || typeof objeto !== 'object') continue;
            const row = objeto as Record<string, unknown>;
            const codigo = normalizeTrackingCode(
              String(row.codObjeto ?? row.codigo ?? row.codigoObjeto ?? ''),
            );
            if (!codigo) continue;

            const mensagem = String(
              row.mensagem ?? row.message ?? row.msg ?? '',
            ).trim();
            const descricao = latestTrackingDescription(objeto);
            if (descricao !== 'Sem eventos') {
              statusByCode.set(codigo, descricao);
            } else if (mensagem) {
              statusByCode.set(codigo, mensagem);
            } else {
              statusByCode.set(codigo, 'Sem eventos');
            }
          }

          for (const codigo of chunk) {
            if (!statusByCode.has(codigo)) {
              statusByCode.set(codigo, 'Sem eventos');
            }
          }
        } catch (chunkError) {
          const msg =
            chunkError instanceof Error
              ? chunkError.message
              : 'Falha ao consultar rastreio.';
          errors.push(msg);
          for (const codigo of chunk) {
            if (!statusByCode.has(codigo)) {
              statusByCode.set(codigo, 'Erro ao consultar');
            }
          }
        }
      }

      if (errors.length > 0 && statusByCode.size === 0) {
        throw new Error(errors[0] ?? 'Falha ao atualizar status dos pedidos.');
      }

      return rows.map((row) => {
        const code = normalizeTrackingCode(row.trackingCode);
        return {
          ...row,
          lastStatus: statusByCode.get(code) ?? 'Erro ao consultar',
        };
      });
    },
    [],
  );

  const loadPedidosComRastreio = useCallback(async () => {
    setPedidosLoading(true);
    setPedidosErro(null);
    try {
      const params = new URLSearchParams({
        page: '1',
        pageSize: '100',
        sortBy: 'orderDate',
        sortOrder: 'desc',
      });
      const res = await erpFetchJson<{ data: Record<string, unknown>[] }>(
        `api/pedidos?${params.toString()}`,
        pedidosListFetchInit,
      );
      const rows = res.data
        .map((row) => normalizePedidoFromApi(row))
        .filter((order: OrderDto) => Boolean(order.trackingCode?.trim()))
        .map((order: OrderDto) => ({
          id: order.id,
          numero: orderDisplayNumber(order),
          receiverName: order.receiverName?.trim() || '—',
          carrierName: order.carrierName?.trim() || '—',
          trackingCode: order.trackingCode!.trim(),
          lastStatus: 'Consultando…',
        }));

      setPedidos(rows);

      if (rows.length > 0) {
        try {
          const withStatus = await applyTrackingStatuses(rows);
          setPedidos(withStatus);
        } catch (statusError) {
          setPedidos((prev) =>
            prev.map((row) =>
              row.lastStatus === 'Consultando…'
                ? { ...row, lastStatus: 'Erro ao consultar' }
                : row,
            ),
          );
          setPedidosErro(
            statusError instanceof Error
              ? statusError.message
              : 'Falha ao atualizar status dos pedidos.',
          );
        }
      }
    } catch (error) {
      setPedidosErro(
        error instanceof Error ? error.message : 'Falha ao carregar pedidos com rastreio.',
      );
      setPedidos([]);
    } finally {
      setPedidosLoading(false);
    }
  }, [applyTrackingStatuses]);

  useEffect(() => {
    void loadPedidosComRastreio();
  }, [loadPedidosComRastreio]);

  useEffect(() => {
    return () => {
      if (comprovanteModal?.url) {
        URL.revokeObjectURL(comprovanteModal.url);
      }
    };
  }, [comprovanteModal?.url]);

  const closeComprovanteModal = () => {
    setComprovanteModal((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  const handleBaixarComprovantePedido = async (row: TrackedOrderRow) => {
    const codigo = row.trackingCode.trim();
    if (!codigo) return;

    setComprovantePedidoId(row.id);
    setPedidosErro(null);
    try {
      const blob = await fetchComprovanteEntregaBlob(codigo);
      const url = URL.createObjectURL(blob);
      const isPdf =
        blob.type.includes('pdf') ||
        blob.type === '' ||
        blob.type === 'application/octet-stream';
      setComprovanteModal((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { codigo, url, isPdf };
      });
    } catch (error) {
      setPedidosErro(
        error instanceof Error ? error.message : 'Falha ao baixar comprovante.',
      );
    } finally {
      setComprovantePedidoId(null);
    }
  };

  const handleDownloadComprovanteModal = () => {
    if (!comprovanteModal) return;
    const a = document.createElement('a');
    a.href = comprovanteModal.url;
    a.download = `comprovante-${comprovanteModal.codigo.replace(/\s/g, '').toUpperCase()}.${
      comprovanteModal.isPdf ? 'pdf' : 'jpg'
    }`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleAtualizarTodos = async () => {
    if (pedidos.length === 0) return;
    setAtualizandoStatus(true);
    setPedidosErro(null);
    try {
      const updated = await applyTrackingStatuses(pedidos);
      setPedidos(updated);
    } catch (error) {
      setPedidos((prev) =>
        prev.map((row) =>
          row.lastStatus === 'Consultando…'
            ? { ...row, lastStatus: 'Erro ao consultar' }
            : row,
        ),
      );
      setPedidosErro(
        error instanceof Error ? error.message : 'Falha ao atualizar status dos pedidos.',
      );
    } finally {
      setAtualizandoStatus(false);
    }
  };

  return (
    <>
      <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <PackageSearch className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Acompanhamento de Pedidos
            </h2>
          </div>
          <button
            type="button"
            disabled={atualizandoStatus || pedidosLoading || pedidos.length === 0}
            onClick={() => void handleAtualizarTodos()}
            className="inline-flex h-[40px] items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-4 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
          >
            {atualizandoStatus ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Atualizar status
          </button>
        </div>

        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Pedidos com status Entregue podem ter o comprovante baixado aqui mesmo.
        </p>

        {pedidosErro ? (
          <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600">
            {pedidosErro}
          </p>
        ) : null}

        {pedidosLoading ? (
          <div className="flex min-h-[160px] items-center justify-center text-sm text-[var(--text-secondary)]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando pedidos com rastreio…
          </div>
        ) : pedidos.length === 0 ? (
          <p className="rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
            Nenhum pedido com código de rastreio encontrado.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border-color)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--input-bg)] text-left text-[var(--text-secondary)]">
                <tr>
                  <th className="px-3 py-2">Pedido</th>
                  <th className="px-3 py-2">Recebedor</th>
                  <th className="px-3 py-2">Transportadora</th>
                  <th className="px-3 py-2">Rastreio</th>
                  <th className="px-3 py-2">Último status</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((row) => {
                  const entregue = isTrackingStatusEntregue(row.lastStatus);
                  const loadingComprovante = comprovantePedidoId === row.id;
                  return (
                    <tr key={row.id} className="border-t border-[var(--border-color)]">
                      <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                        #{row.numero}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-primary)]">{row.receiverName}</td>
                      <td className="px-3 py-2 text-[var(--text-primary)]">{row.carrierName}</td>
                      <td className="px-3 py-2 font-mono text-xs text-[var(--text-primary)]">
                        {row.trackingCode}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-primary)]">{row.lastStatus}</td>
                      <td className="px-3 py-2">
                        {entregue ? (
                          <button
                            type="button"
                            disabled={loadingComprovante || atualizandoStatus}
                            onClick={() => void handleBaixarComprovantePedido(row)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline disabled:opacity-50"
                          >
                            {loadingComprovante ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            Baixar Comprovante
                          </button>
                        ) : (
                          <span className="text-xs text-[var(--text-secondary)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {comprovanteModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay,rgba(0,0,0,0.55))] p-4">
          <div
            className="absolute inset-0"
            aria-hidden
            onClick={closeComprovanteModal}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Comprovante de entrega"
            className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Comprovante de entrega
                </h3>
                <p className="font-mono text-xs text-[var(--text-secondary)]">
                  {comprovanteModal.codigo}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadComprovanteModal}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-3 text-sm font-semibold text-[var(--color-text-inverse)]"
                >
                  Baixar
                </button>
                <button
                  type="button"
                  onClick={closeComprovanteModal}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 text-sm font-semibold text-[var(--text-primary)]"
                >
                  Fechar
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-[var(--input-bg)] p-3">
              {comprovanteModal.isPdf ? (
                <iframe
                  title={`Comprovante ${comprovanteModal.codigo}`}
                  src={comprovanteModal.url}
                  className="h-[70vh] w-full rounded-lg border border-[var(--border-color)] bg-white"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={comprovanteModal.url}
                  alt={`Comprovante de entrega ${comprovanteModal.codigo}`}
                  className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg border border-[var(--border-color)] object-contain"
                />
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
