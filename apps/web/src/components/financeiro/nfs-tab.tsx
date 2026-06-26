'use client';

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  CobrarNfModal,
  PagarNfModal,
} from '@/src/components/financeiro/modals';
import type { NfEmAberto, NfsEmAbertoResponse } from '@/src/components/financeiro/types';
import { formatCurrency, formatDateBr, ultimaNF } from '@/src/components/financeiro/utils';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

function NfStatusBadge(props: { status: string }) {
  const { status } = props;
  const isAtrasado = status === 'ATRASADO';
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        isAtrasado
          ? 'bg-red-500/20 text-red-400'
          : 'bg-blue-500/20 text-blue-300'
      }`}
    >
      {status}
    </span>
  );
}

export function FinanceiroNfsTab() {
  const [rows, setRows] = useState<NfEmAberto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pagarNf, setPagarNf] = useState<NfEmAberto | null>(null);
  const [cobrarNf, setCobrarNf] = useState<NfEmAberto | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pageSize = 100;
      let page = 1;
      const allRows: NfEmAberto[] = [];

      while (true) {
        const qs = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        });
        const res = await erpFetchJson<NfsEmAbertoResponse>(
          `api/financeiro/nfs-em-aberto?${qs.toString()}`,
        );
        allRows.push(...res.data);
        if (page >= res.meta.totalPages) break;
        page += 1;
      }

      setRows(allRows);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : 'Erro ao carregar NFs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePagar = async (dataPagamento: string) => {
    if (!pagarNf) return;
    setActionLoading(true);
    try {
      await erpFetchJson(`api/financeiro/nfs/${pagarNf.id}/pagar`, {
        method: 'PATCH',
        body: JSON.stringify({ dataPagamento }),
      });
      setPagarNf(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao marcar como pago.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCobrar = async (observacao: string) => {
    if (!cobrarNf) return;
    setActionLoading(true);
    try {
      await erpFetchJson(`api/financeiro/nfs/${cobrarNf.id}/cobrar`, {
        method: 'PATCH',
        body: JSON.stringify({ observacao }),
      });
      setCobrarNf(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao registrar cobrança.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-white/10">
        <div className="erp-scrollbar max-h-[60vh] overflow-x-auto overflow-y-auto">
          <table className="min-w-[900px] w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-[#0d1320] text-zinc-400">
                <th className="px-3 py-2.5 font-semibold">NF</th>
                <th className="px-3 py-2.5 font-semibold">Pedido</th>
                <th className="px-3 py-2.5 font-semibold">Recebedor</th>
                <th className="px-3 py-2.5 font-semibold text-right">Valor</th>
                <th className="px-3 py-2.5 font-semibold">Data emissão</th>
                <th className="px-3 py-2.5 font-semibold text-center">Dias em aberto</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-zinc-500">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-zinc-500">
                    Nenhuma NF em aberto.
                  </td>
                </tr>
              ) : (
                rows.map((nf) => (
                  <tr
                    key={nf.id}
                    className="border-b border-white/5 hover:bg-white/[0.02]"
                  >
                    <td className="px-3 py-2.5 font-mono text-zinc-200">
                      {ultimaNF(nf.invoiceNumber)}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-300">#{nf.pedido}</td>
                    <td className="max-w-[180px] truncate px-3 py-2.5 text-zinc-400">
                      {nf.recebedor}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-200">
                      {formatCurrency(nf.valor)}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400">
                      {formatDateBr(nf.dataEmissao)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-center tabular-nums font-semibold ${
                        nf.diasEmAberto > 12 ? 'text-red-400' : 'text-zinc-300'
                      }`}
                    >
                      {nf.diasEmAberto}
                    </td>
                    <td className="px-3 py-2.5">
                      <NfStatusBadge status={nf.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPagarNf(nf)}
                          className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/20"
                        >
                          Marcar pago
                        </button>
                        <button
                          type="button"
                          onClick={() => setCobrarNf(nf)}
                          className="rounded-md border border-white/10 bg-[#0d1320] px-2 py-1 text-[10px] font-medium text-zinc-300 hover:border-white/20"
                        >
                          Cobrança
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading ? (
          <div className="border-t border-white/10 bg-[#0d1320] px-3 py-2.5">
            <p className="text-xs text-zinc-500">{rows.length} registro(s)</p>
          </div>
        ) : null}
      </div>

      <PagarNfModal
        open={Boolean(pagarNf)}
        loading={actionLoading}
        onClose={() => setPagarNf(null)}
        onConfirm={(d) => void handlePagar(d)}
      />
      <CobrarNfModal
        open={Boolean(cobrarNf)}
        loading={actionLoading}
        onClose={() => setCobrarNf(null)}
        onConfirm={(o) => void handleCobrar(o)}
      />
    </div>
  );
}
