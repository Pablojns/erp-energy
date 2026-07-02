'use client';

import { AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FinFilterOptionButton,
  FinFilterOptionGroup,
  FinFiltersDropdown,
} from '@/src/components/financeiro/fin-filters-dropdown';
import {
  CobrarNfModal,
  PagarNfModal,
} from '@/src/components/financeiro/modals';
import { FinTableSkeleton } from '@/src/components/financeiro/skeletons';
import type {
  FinanceiroPeriod,
  NfDisplayStatus,
  NfEmAberto,
} from '@/src/components/financeiro/types';
import {
  fetchAllNfsEmAberto,
  filterNfsByPeriod,
  formatCurrency,
  formatDateBr,
  nfDisplayStatus,
  ultimaNF,
} from '@/src/components/financeiro/utils';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

function NfStatusBadge(props: { status: NfDisplayStatus }) {
  const { status } = props;
  const styles: Record<NfDisplayStatus, string> = {
    ABERTO:
      'border-[color-mix(in_srgb,var(--fin-accent)_40%,transparent)] bg-[var(--fin-accent-soft)] text-[var(--fin-accent)]',
    ATRASADO:
      'border-[color-mix(in_srgb,var(--fin-warning)_45%,transparent)] bg-[var(--fin-warning-soft)] text-[var(--fin-warning)]',
    CRITICO:
      'border-[color-mix(in_srgb,var(--fin-danger-deep)_50%,transparent)] bg-[color-mix(in_srgb,var(--fin-danger-deep)_18%,transparent)] text-[var(--fin-danger-deep)]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles[status]}`}
    >
      {status === 'CRITICO' ? <AlertTriangle className="h-3 w-3" aria-hidden /> : null}
      {status}
    </span>
  );
}

export function FinanceiroNfsTab(props: {
  period: FinanceiroPeriod;
  refreshToken: number;
  onCountChange?: (count: number) => void;
}) {
  const { period, refreshToken, onCountChange } = props;
  const [rows, setRows] = useState<NfEmAberto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recebedorFilter, setRecebedorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | NfDisplayStatus>('ALL');
  const [pagarNf, setPagarNf] = useState<NfEmAberto | null>(null);
  const [cobrarNf, setCobrarNf] = useState<NfEmAberto | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allRows = await fetchAllNfsEmAberto();
      setRows(allRows);
      onCountChange?.(allRows.length);
    } catch (e) {
      setRows([]);
      onCountChange?.(0);
      setError(e instanceof Error ? e.message : 'Erro ao carregar NFs.');
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const recebedores = useMemo(() => {
    const set = new Set(rows.map((r) => r.recebedor).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [rows]);

  const periodFiltered = useMemo(
    () => filterNfsByPeriod(rows, period.dataInicio, period.dataFim),
    [rows, period.dataInicio, period.dataFim],
  );

  const filtered = useMemo(() => {
    let list = periodFiltered;
    if (statusFilter !== 'ALL') {
      list = list.filter((r) => nfDisplayStatus(r) === statusFilter);
    }
    const q = recebedorFilter.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => r.recebedor?.toLowerCase().includes(q));
    }
    return list;
  }, [periodFiltered, recebedorFilter, statusFilter]);

  const activeFilterCount =
    (statusFilter !== 'ALL' ? 1 : 0) + (recebedorFilter.trim() ? 1 : 0);

  const clearFilters = () => {
    setStatusFilter('ALL');
    setRecebedorFilter('');
  };

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

  if (loading) {
    return <FinTableSkeleton rows={8} />;
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-sm text-[var(--fin-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <FinFiltersDropdown
            activeCount={activeFilterCount}
            title="Filtrar NFs"
            onClear={clearFilters}
            searchSlot={
              <>
                <input
                  type="search"
                  list="fin-recebedores"
                  value={recebedorFilter}
                  onChange={(e) => setRecebedorFilter(e.target.value)}
                  placeholder="Buscar por recebedor..."
                  className="fin-input h-10 w-full rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--fin-accent-soft)]"
                />
                <datalist id="fin-recebedores">
                  {recebedores.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </>
            }
          >
            <FinFilterOptionGroup label="Status">
              {(
                [
                  ['ALL', 'Todos'],
                  ['ABERTO', 'Aberto'],
                  ['ATRASADO', 'Atrasado'],
                  ['CRITICO', 'Crítico'],
                ] as const
              ).map(([value, label]) => (
                <FinFilterOptionButton
                  key={value}
                  active={statusFilter === value}
                  onClick={() => setStatusFilter(value)}
                >
                  {label}
                </FinFilterOptionButton>
              ))}
            </FinFilterOptionGroup>
          </FinFiltersDropdown>
        </div>
        <p className="shrink-0 text-xs text-[var(--fin-text-muted)]">
          {filtered.length} registro(s)
        </p>
      </div>

      <div className="fin-card overflow-hidden rounded-2xl">
        <div className="erp-scrollbar max-h-[min(68vh,720px)] overflow-x-auto overflow-y-auto">
          <table className="min-w-[760px] w-full text-left text-xs sm:text-sm">
            <thead
              className="sticky top-0 z-[1] text-[10px] font-semibold uppercase tracking-wider text-[var(--fin-text-muted)]"
              style={{ background: 'var(--fin-card-muted)' }}
            >
              <tr className="border-b" style={{ borderColor: 'var(--fin-border)' }}>
                <th className="px-4 py-3">NF</th>
                <th className="px-4 py-3">Pedido</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Data emissão</th>
                <th className="px-4 py-3 text-center">Dias em aberto</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-[var(--fin-text-muted)]"
                  >
                    Nenhuma NF em aberto.
                  </td>
                </tr>
              ) : (
                filtered.map((nf) => {
                  const status = nfDisplayStatus(nf);
                  return (
                    <tr
                      key={nf.id}
                      className="border-b transition hover:bg-[var(--fin-card-muted)]"
                      style={{ borderColor: 'var(--fin-border)' }}
                    >
                      <td className="px-4 py-3 font-mono text-[var(--fin-text)]">
                        {ultimaNF(nf.invoiceNumber)}
                      </td>
                      <td className="px-4 py-3 text-[var(--fin-text-secondary)]">
                        #{nf.pedido}
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-[var(--fin-text)]">
                        {formatCurrency(nf.valor)}
                      </td>
                      <td className="px-4 py-3 text-[var(--fin-text-secondary)]">
                        {formatDateBr(nf.dataEmissao)}
                      </td>
                      <td
                        className={`px-4 py-3 text-center tabular-nums font-semibold ${
                          nf.diasEmAberto > 30
                            ? 'text-[var(--fin-danger-deep)]'
                            : nf.diasEmAberto > 12
                              ? 'text-[var(--fin-warning)]'
                              : 'text-[var(--fin-text)]'
                        }`}
                      >
                        {nf.diasEmAberto}
                      </td>
                      <td className="px-4 py-3">
                        <NfStatusBadge status={status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:justify-end">
                          <button
                            type="button"
                            onClick={() => setPagarNf(nf)}
                            className="rounded-lg border px-2.5 py-1 text-[10px] font-semibold sm:text-xs"
                            style={{
                              borderColor: 'color-mix(in srgb, var(--fin-success) 40%, transparent)',
                              background: 'var(--fin-success-soft)',
                              color: 'var(--fin-success)',
                            }}
                          >
                            Marcar pago
                          </button>
                          <button
                            type="button"
                            onClick={() => setCobrarNf(nf)}
                            className="rounded-lg border px-2.5 py-1 text-[10px] font-semibold text-[var(--fin-text-secondary)] sm:text-xs"
                            style={{
                              borderColor: 'var(--fin-border)',
                              background: 'var(--fin-card-muted)',
                            }}
                          >
                            Cobrança
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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

export function nfsToCsvRows(rows: NfEmAberto[]): string[][] {
  return rows.map((nf) => [
    ultimaNF(nf.invoiceNumber),
    nf.pedido,
    nf.recebedor,
    String(nf.valor),
    formatDateBr(nf.dataEmissao),
    String(nf.diasEmAberto),
    nfDisplayStatus(nf),
  ]);
}

export const NFS_CSV_HEADERS = [
  'NF',
  'Pedido',
  'Recebedor',
  'Valor',
  'Data emissão',
  'Dias em aberto',
  'Status',
];
