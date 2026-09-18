'use client';

import { FileSpreadsheet, Loader2, Mail, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FinFilterOptionButton,
  FinFilterOptionGroup,
  FinFiltersDropdown,
} from '@/src/components/financeiro/fin-filters-dropdown';
import { FinTableSkeleton } from '@/src/components/financeiro/skeletons';
import type {
  BankReconcileApplyResult,
  BankReconcilePreview,
  FinanceiroPeriod,
  NotaAberta,
  NotasAbertasResponse,
  WegImportApplyResult,
  WegImportPreview,
} from '@/src/components/financeiro/types';
import {
  formatCurrency,
  formatDateBr,
  formatDayMonth,
  formatYmd,
} from '@/src/components/financeiro/utils';
import { erpFetchFormData } from '@/src/components/compras/compras-api';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

type StatusFilter = 'ALL' | 'VAZIO' | 'DECLARADO' | 'CONFIRMADO';

type CobrancaPreview = {
  invoiceDigits: string[];
  pedido: string;
  customerName: string | null;
  emailSugerido: string | null;
  assunto: string;
  corpo: string;
  anexosDisponiveis: Array<{
    invoiceDigits: string;
    invoiceNumber: string;
    xml: boolean;
    danfe: boolean;
  }>;
};

function StatusBadge(props: { row: NotaAberta }) {
  const { row } = props;
  if (row.status === 'CONFIRMADO') {
    const origem =
      row.confirmadoRecebidoOrigem &&
      row.confirmadoRecebidoOrigem !== 'Manual'
        ? row.confirmadoRecebidoOrigem
        : row.confirmadoRecebidoPor
          ? `confirmado por ${row.confirmadoRecebidoPor}`
          : '';
    return (
      <span className="inline-flex max-w-[28rem] items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold leading-snug text-[var(--fin-success)]"
        style={{
          borderColor: 'color-mix(in srgb, var(--fin-success) 40%, transparent)',
          background: 'var(--fin-success-soft)',
        }}
      >
        🟢 Confirmado Recebido ({formatDateBr(row.confirmadoRecebidoEm ?? '')}
        {origem ? `, ${origem}` : ''})
      </span>
    );
  }
  if (row.status === 'DECLARADO') {
    return (
      <span className="inline-flex max-w-[32rem] flex-col gap-1">
        <span
          className="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold leading-snug text-[var(--fin-warning)]"
          style={{
            borderColor: 'color-mix(in srgb, var(--fin-warning) 45%, transparent)',
            background: 'var(--fin-warning-soft)',
          }}
        >
          🟡 Declarado Pago (WEG, {formatDateBr(row.declaradoPagoEm ?? '')}) —
          aguardando confirmação bancária
        </span>
        {row.alertaVerificar ? (
          <span
            className="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold leading-snug text-[var(--fin-danger)]"
            style={{
              borderColor: 'color-mix(in srgb, var(--fin-danger) 40%, transparent)',
              background: 'var(--fin-danger-soft)',
            }}
          >
            ⚠️ Verificar — {formatDateBr(row.alertaVerificar.data)} ·{' '}
            {formatCurrency(row.alertaVerificar.valor)} ·{' '}
            {row.alertaVerificar.nome || 'remetente desconhecido'}
          </span>
        ) : null}
      </span>
    );
  }
  if (row.status === 'LEGADO') {
    return (
      <span
        className="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold text-[var(--fin-text-muted)]"
        style={{ borderColor: 'var(--fin-border)', background: 'var(--fin-card-muted)' }}
      >
        Legado — considerado pago
      </span>
    );
  }
  return (
    <span
      className="inline-flex min-h-[1.25rem] min-w-[2.5rem] items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold text-[var(--fin-text-muted)]"
      style={{ borderColor: 'var(--fin-border)', background: 'var(--fin-card-muted)' }}
    >
      Em Aberto
    </span>
  );
}

export function FinanceiroNotasAbertasTab(props: {
  period: FinanceiroPeriod;
  refreshToken: number;
  onCountChange?: (count: number) => void;
}) {
  const { period, refreshToken, onCountChange } = props;
  const fileRef = useRef<HTMLInputElement>(null);
  const extratoRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<NotaAberta[]>([]);
  const [legadoOcultos, setLegadoOcultos] = useState(0);
  const [historico, setHistorico] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [emissaoDe, setEmissaoDe] = useState('');
  const [emissaoAte, setEmissaoAte] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<WegImportPreview | null>(null);
  const [pendingExtrato, setPendingExtrato] = useState<File | null>(null);
  const [extratoPreview, setExtratoPreview] = useState<BankReconcilePreview | null>(null);
  const [cobranca, setCobranca] = useState<CobrancaPreview | null>(null);
  const [cobrancaTo, setCobrancaTo] = useState('');
  const [cobrancaAssunto, setCobrancaAssunto] = useState('');
  const [cobrancaCorpo, setCobrancaCorpo] = useState('');
  const [sendingCobranca, setSendingCobranca] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = historico ? '?historico=1' : '';
      const res = await erpFetchJson<NotasAbertasResponse>(
        `api/financeiro/notas-abertas${qs}`,
      );
      setRows(res.data);
      setLegadoOcultos(res.meta.legadoOcultos);
      onCountChange?.(res.data.filter((r) => !r.legado).length);
    } catch (e) {
      setRows([]);
      onCountChange?.(0);
      setError(e instanceof Error ? e.message : 'Erro ao carregar notas.');
    } finally {
      setLoading(false);
    }
  }, [historico, onCountChange]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const periodFiltered = useMemo(() => {
    const start = (emissaoDe || period.dataInicio).trim();
    const end = (emissaoAte || period.dataFim).trim();
    if (!start || !end) return rows;
    return rows.filter((nf) => {
      const d = formatYmd(new Date(nf.dataEmissao));
      return d >= start && d <= end;
    });
  }, [rows, period.dataInicio, period.dataFim, emissaoDe, emissaoAte]);

  const filtered = useMemo(() => {
    let list = periodFiltered;
    if (statusFilter !== 'ALL') {
      list = list.filter((r) => r.status === statusFilter);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.pedido.toLowerCase().includes(q) ||
          r.invoiceNumber.toLowerCase().includes(q) ||
          r.invoiceDigits.includes(q.replace(/\D/g, '')),
      );
    }
    return [...list].sort((a, b) => {
      if (b.diasEmAberto !== a.diasEmAberto) return b.diasEmAberto - a.diasEmAberto;
      return a.invoiceDigits.localeCompare(b.invoiceDigits, undefined, { numeric: true });
    });
  }, [periodFiltered, query, statusFilter]);

  const activeFilterCount =
    (statusFilter !== 'ALL' ? 1 : 0) +
    (emissaoDe.trim() ? 1 : 0) +
    (emissaoAte.trim() ? 1 : 0);

  const clearFilters = () => {
    setStatusFilter('ALL');
    setEmissaoDe('');
    setEmissaoAte('');
  };

  const toggleSelect = (digits: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(digits)) next.delete(digits);
      else next.add(digits);
      return next;
    });
  };

  const selectedRows = useMemo(
    () => filtered.filter((r) => selected.has(r.invoiceDigits)),
    [filtered, selected],
  );

  const openCobranca = async (digits: string[]) => {
    setError(null);
    setActionId('cobranca');
    try {
      const res = await erpFetchJson<CobrancaPreview>(
        'api/financeiro/notas-abertas/cobranca/preview',
        {
          method: 'POST',
          body: JSON.stringify({ invoiceDigits: digits }),
        },
      );
      setCobranca(res);
      setCobrancaTo(res.emailSugerido ?? '');
      setCobrancaAssunto(res.assunto);
      setCobrancaCorpo(res.corpo);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao preparar cobrança.');
    } finally {
      setActionId(null);
    }
  };

  const handleSendCobranca = async () => {
    if (!cobranca) return;
    setSendingCobranca(true);
    setError(null);
    try {
      await erpFetchJson('api/financeiro/notas-abertas/cobranca/enviar', {
        method: 'POST',
        body: JSON.stringify({
          invoiceDigits: cobranca.invoiceDigits,
          to: cobrancaTo,
          assunto: cobrancaAssunto,
          corpo: cobrancaCorpo,
        }),
      });
      setCobranca(null);
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar cobrança.');
    } finally {
      setSendingCobranca(false);
    }
  };

  const handlePickFile = async (file: File | null) => {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name) && !/\.xls$/i.test(file.name)) {
      setError('Selecione um arquivo Excel (.xlsx).');
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await erpFetchFormData<WegImportPreview>(
        'api/financeiro/notas-abertas/importar-weg',
        form,
      );
      setPendingFile(file);
      setPreview(res);
    } catch (e) {
      setPreview(null);
      setPendingFile(null);
      setError(e instanceof Error ? e.message : 'Erro ao ler a planilha.');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleApplyImport = async () => {
    if (!pendingFile) return;
    setApplying(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', pendingFile);
      await erpFetchFormData<WegImportApplyResult>(
        'api/financeiro/notas-abertas/importar-weg/confirmar',
        form,
      );
      setPreview(null);
      setPendingFile(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao confirmar importação.');
    } finally {
      setApplying(false);
    }
  };

  const handlePickExtrato = async (file: File | null) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setError('Selecione o CSV do extrato Inter.');
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await erpFetchFormData<BankReconcilePreview>(
        'api/financeiro/notas-abertas/importar-extrato',
        form,
      );
      setPendingExtrato(file);
      setExtratoPreview(res);
    } catch (e) {
      setExtratoPreview(null);
      setPendingExtrato(null);
      setError(e instanceof Error ? e.message : 'Erro ao ler o extrato.');
    } finally {
      setImporting(false);
      if (extratoRef.current) extratoRef.current.value = '';
    }
  };

  const handleApplyExtrato = async () => {
    if (!pendingExtrato) return;
    setApplying(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', pendingExtrato);
      await erpFetchFormData<BankReconcileApplyResult>(
        'api/financeiro/notas-abertas/importar-extrato/confirmar',
        form,
      );
      setExtratoPreview(null);
      setPendingExtrato(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao aplicar conciliação.');
    } finally {
      setApplying(false);
    }
  };

  const handleConfirmarPago = async (row: NotaAberta) => {
    if (row.status !== 'DECLARADO') return;
    setActionId(row.invoiceDigits);
    setError(null);
    try {
      await erpFetchJson(`api/financeiro/notas-abertas/${row.invoiceDigits}/confirmar-pago`, {
        method: 'PATCH',
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao confirmar pagamento.');
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return <FinTableSkeleton rows={8} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      {error ? (
        <p className="shrink-0 text-sm text-[var(--fin-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <FinFiltersDropdown
            activeCount={activeFilterCount}
            title="Filtrar notas"
            onClear={clearFilters}
            searchSlot={
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar pedido ou NF..."
                className="fin-input h-10 w-full rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--fin-accent-soft)]"
              />
            }
          >
            <FinFilterOptionGroup label="Status">
              {(
                [
                  ['ALL', 'Todos'],
                  ['VAZIO', 'Em Aberto'],
                  ['DECLARADO', '🟡 Declarado Pago'],
                  ['CONFIRMADO', '🟢 Confirmado Recebido'],
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
            <div className="mt-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fin-text-muted)]">
                Emissão
              </p>
              <div className="flex flex-wrap gap-2">
                <label className="flex flex-col gap-1 text-[10px] text-[var(--fin-text-muted)]">
                  De
                  <input
                    type="date"
                    value={emissaoDe}
                    onChange={(e) => setEmissaoDe(e.target.value)}
                    className="fin-input h-9 rounded-lg px-2 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[10px] text-[var(--fin-text-muted)]">
                  Até
                  <input
                    type="date"
                    value={emissaoAte}
                    onChange={(e) => setEmissaoAte(e.target.value)}
                    className="fin-input h-9 rounded-lg px-2 text-xs"
                  />
                </label>
              </div>
            </div>
          </FinFiltersDropdown>
          <label className="mt-2 inline-flex items-center gap-2 text-xs text-[var(--fin-text-secondary)]">
            <input
              type="checkbox"
              checked={historico}
              onChange={(e) => setHistorico(e.target.checked)}
            />
            Ver histórico completo
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-[var(--fin-text-muted)]">
            {filtered.length} nota(s)
            {!historico && legadoOcultos > 0 ? ` · ${legadoOcultos} legado(s) oculto(s)` : ''}
          </p>
          {selectedRows.length > 0 ? (
            <button
              type="button"
              onClick={() => void openCobranca(selectedRows.map((r) => r.invoiceDigits))}
              disabled={actionId === 'cobranca'}
              className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold text-[var(--fin-text)] transition hover:bg-[var(--fin-card-muted)]"
              style={{ borderColor: 'var(--fin-border)' }}
            >
              <Mail className="h-3.5 w-3.5" />
              Cobrar selecionadas ({selectedRows.length})
            </button>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => void handlePickFile(e.target.files?.[0] ?? null)}
          />
          <input
            ref={extratoRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => void handlePickExtrato(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold text-[var(--fin-text)] transition hover:bg-[var(--fin-card-muted)]"
            style={{ borderColor: 'var(--fin-border)' }}
          >
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Importar Planilha WEG
          </button>
          <button
            type="button"
            onClick={() => extratoRef.current?.click()}
            disabled={importing}
            className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold text-[var(--fin-text)] transition hover:bg-[var(--fin-card-muted)]"
            style={{ borderColor: 'var(--fin-border)' }}
          >
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            Importar Extrato Inter (CSV)
          </button>
        </div>
      </div>

      <div className="fin-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
        <div className="lista-container erp-scrollbar overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-xs sm:text-sm">
            <thead
              className="sticky top-0 z-[1] text-[10px] font-semibold uppercase tracking-wider text-[var(--fin-text-muted)]"
              style={{ background: 'var(--fin-card-muted)' }}
            >
              <tr className="border-b" style={{ borderColor: 'var(--fin-border)' }}>
                <th className="w-10 px-3 py-3" />
                <th className="px-4 py-3">Pedido</th>
                <th className="px-4 py-3">NF</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Emissão</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3 text-center">Dias em Aberto</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-[var(--fin-text-muted)]">
                    Nenhuma nota em aberto.
                  </td>
                </tr>
              ) : (
                filtered.map((nf) => {
                  const canConfirm = nf.status === 'DECLARADO';
                  const overdue = nf.diasEmAberto > 12;
                  const lastCobranca = nf.cobrancas?.[0];
                  return (
                    <tr
                      key={nf.invoiceDigits}
                      className="border-b transition hover:bg-[var(--fin-card-muted)]"
                      style={{ borderColor: 'var(--fin-border)' }}
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(nf.invoiceDigits)}
                          onChange={() => toggleSelect(nf.invoiceDigits)}
                          aria-label={`Selecionar NF ${nf.invoiceNumber}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-[var(--fin-text)]">
                        {nf.pedido}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-[var(--fin-text)]">
                        {nf.invoiceNumber}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-[var(--fin-text)]">
                        {formatCurrency(nf.valor)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[var(--fin-text-secondary)]">
                        {formatDayMonth(nf.dataEmissao)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[var(--fin-text-secondary)]">
                        {formatDayMonth(nf.vencimento)}
                      </td>
                      <td
                        className={`px-4 py-3 text-center tabular-nums font-semibold ${
                          nf.diasEmAberto > 30
                            ? 'text-[var(--fin-danger-deep)]'
                            : overdue
                              ? 'text-[var(--fin-warning)]'
                              : 'text-[var(--fin-text)]'
                        }`}
                      >
                        {nf.diasEmAberto} dias
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <StatusBadge row={nf} />
                          {lastCobranca ? (
                            <span className="text-[10px] text-[var(--fin-text-muted)]">
                              Cobrança {formatDateBr(lastCobranca.enviadoEm)}
                              {lastCobranca.enviadoPor
                                ? ` · ${lastCobranca.enviadoPor}`
                                : ''}{' '}
                              → {lastCobranca.enviadoPara}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => void openCobranca([nf.invoiceDigits])}
                            disabled={actionId === 'cobranca'}
                            className="rounded-lg border px-2.5 py-1 text-[10px] font-semibold sm:text-xs"
                            style={{
                              borderColor: 'var(--fin-border)',
                              background: 'var(--fin-card-muted)',
                              color: 'var(--fin-text)',
                            }}
                          >
                            Enviar Cobrança
                          </button>
                          <button
                            type="button"
                            disabled={!canConfirm || actionId === nf.invoiceDigits}
                            onClick={() => void handleConfirmarPago(nf)}
                            className="rounded-lg border px-2.5 py-1 text-[10px] font-semibold sm:text-xs disabled:cursor-not-allowed disabled:opacity-40"
                            style={{
                              borderColor: canConfirm
                                ? 'color-mix(in srgb, var(--fin-success) 40%, transparent)'
                                : 'var(--fin-border)',
                              background: canConfirm
                                ? 'var(--fin-success-soft)'
                                : 'var(--fin-card-muted)',
                              color: canConfirm ? 'var(--fin-success)' : 'var(--fin-text-muted)',
                            }}
                          >
                            {actionId === nf.invoiceDigits ? 'Confirmando…' : 'Confirmar Pago'}
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

      {cobranca ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div
            className="fin-card flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cobranca-title"
          >
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: 'var(--fin-border)' }}
            >
              <h3
                id="cobranca-title"
                className="flex items-center gap-2 text-sm font-semibold text-[var(--fin-text)]"
              >
                <Mail className="h-4 w-4" />
                Enviar cobrança — pedido {cobranca.pedido}
              </h3>
              <button
                type="button"
                onClick={() => setCobranca(null)}
                className="text-xs text-[var(--fin-text-muted)] hover:text-[var(--fin-text)]"
              >
                Fechar
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4 text-sm">
              {cobranca.customerName ? (
                <p className="text-xs text-[var(--fin-text-secondary)]">
                  Cliente: {cobranca.customerName}
                </p>
              ) : null}
              <label className="block text-xs text-[var(--fin-text-muted)]">
                Destinatário
                <input
                  type="email"
                  value={cobrancaTo}
                  onChange={(e) => setCobrancaTo(e.target.value)}
                  className="fin-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-[var(--fin-text-muted)]">
                Assunto
                <input
                  type="text"
                  value={cobrancaAssunto}
                  onChange={(e) => setCobrancaAssunto(e.target.value)}
                  className="fin-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-[var(--fin-text-muted)]">
                Corpo
                <textarea
                  value={cobrancaCorpo}
                  onChange={(e) => setCobrancaCorpo(e.target.value)}
                  rows={8}
                  className="fin-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                />
              </label>
              <div className="rounded-lg border p-3 text-xs" style={{ borderColor: 'var(--fin-border)' }}>
                <p className="mb-1 font-semibold text-[var(--fin-text)]">Anexos</p>
                <ul className="space-y-1 text-[var(--fin-text-secondary)]">
                  {cobranca.anexosDisponiveis.map((a) => (
                    <li key={a.invoiceDigits}>
                      NF {a.invoiceNumber}:{' '}
                      {a.xml || a.danfe
                        ? [a.xml ? 'XML' : null, a.danfe ? 'DANFE' : null]
                            .filter(Boolean)
                            .join(' + ')
                        : 'nenhum arquivo no storage'}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div
              className="flex justify-end gap-2 border-t px-4 py-3"
              style={{ borderColor: 'var(--fin-border)' }}
            >
              <button
                type="button"
                onClick={() => setCobranca(null)}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                style={{ borderColor: 'var(--fin-border)' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={sendingCobranca || !cobrancaTo.includes('@')}
                onClick={() => void handleSendCobranca()}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--fin-accent)' }}
              >
                {sendingCobranca ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Enviar e-mail
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div
            className="fin-card flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="weg-import-title"
          >
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: 'var(--fin-border)' }}
            >
              <h3 id="weg-import-title" className="flex items-center gap-2 text-sm font-semibold text-[var(--fin-text)]">
                <FileSpreadsheet className="h-4 w-4" />
                Preview da planilha WEG
              </h3>
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setPendingFile(null);
                }}
                className="text-xs text-[var(--fin-text-muted)] hover:text-[var(--fin-text)]"
              >
                Fechar
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4 text-sm">
              <p className="text-[var(--fin-text-secondary)]">
                {preview.matched.length} nota(s) seriam marcadas{' '}
                <strong>Declarado Pago</strong>
                {preview.notFound.length > 0
                  ? ` · ${preview.notFound.length} NF(s) da planilha não encontradas no sistema`
                  : ''}
                . {preview.totalLinhasComReferencia} linha(s) com Referência.
              </p>
              {preview.matched.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--fin-border)' }}>
                  <table className="w-full text-left text-xs">
                    <thead className="text-[10px] uppercase tracking-wider text-[var(--fin-text-muted)]">
                      <tr>
                        <th className="px-3 py-2">NF</th>
                        <th className="px-3 py-2">Pedido</th>
                        <th className="px-3 py-2">Valor</th>
                        <th className="px-3 py-2">Pago em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.matched.slice(0, 80).map((m) => (
                        <tr key={m.invoiceDigits} className="border-t" style={{ borderColor: 'var(--fin-border)' }}>
                          <td className="px-3 py-1.5 font-mono">{m.invoiceDigits}</td>
                          <td className="px-3 py-1.5">{m.pedido}</td>
                          <td className="px-3 py-1.5 tabular-nums">{formatCurrency(m.valor)}</td>
                          <td className="px-3 py-1.5">
                            {m.pagoEm ? formatDateBr(m.pagoEm) : '—'}
                            {m.legado ? ' · legado' : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.matched.length > 80 ? (
                    <p className="px-3 py-2 text-[11px] text-[var(--fin-text-muted)]">
                      + {preview.matched.length - 80} outra(s)
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div
              className="flex justify-end gap-2 border-t px-4 py-3"
              style={{ borderColor: 'var(--fin-border)' }}
            >
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setPendingFile(null);
                }}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                style={{ borderColor: 'var(--fin-border)' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={applying || preview.matched.length === 0}
                onClick={() => void handleApplyImport()}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--fin-accent)' }}
              >
                {applying ? 'Aplicando…' : 'Confirmar importação'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {extratoPreview ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div
            className="fin-card flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="extrato-import-title"
          >
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: 'var(--fin-border)' }}
            >
              <h3
                id="extrato-import-title"
                className="flex items-center gap-2 text-sm font-semibold text-[var(--fin-text)]"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Preview Extrato Inter
              </h3>
              <button
                type="button"
                onClick={() => {
                  setExtratoPreview(null);
                  setPendingExtrato(null);
                }}
                className="text-xs text-[var(--fin-text-muted)] hover:text-[var(--fin-text)]"
              >
                Fechar
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4 text-sm">
              <p className="text-[var(--fin-text-secondary)]">
                WEG identificados: {extratoPreview.wegIdentificados} · Auto-match:{' '}
                {extratoPreview.autoMatches.length} · Verificar:{' '}
                {extratoPreview.alerts.length} · WEG sem nota:{' '}
                {extratoPreview.wegSemNota.length}
              </p>
            </div>
            <div
              className="flex justify-end gap-2 border-t px-4 py-3"
              style={{ borderColor: 'var(--fin-border)' }}
            >
              <button
                type="button"
                onClick={() => {
                  setExtratoPreview(null);
                  setPendingExtrato(null);
                }}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                style={{ borderColor: 'var(--fin-border)' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={applying}
                onClick={() => void handleApplyExtrato()}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--fin-accent)' }}
              >
                {applying ? 'Aplicando…' : 'Aplicar conciliação'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
