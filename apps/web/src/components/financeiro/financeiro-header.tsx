'use client';

import { Calendar, Download, RefreshCw } from 'lucide-react';
import type {
  FinanceiroPeriod,
  FinanceiroPeriodPreset,
  FinanceiroTab,
} from '@/src/components/financeiro/types';

const TABS: { id: FinanceiroTab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'nfs', label: 'NFs em Aberto' },
  { id: 'despesas', label: 'Despesas' },
  { id: 'extrato', label: 'Extrato' },
];

const PERIOD_PRESETS: { id: FinanceiroPeriodPreset; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'mes', label: 'Este mês' },
  { id: 'personalizado', label: 'Personalizado' },
];

export function FinanceiroHeader(props: {
  tab: FinanceiroTab;
  onTabChange: (tab: FinanceiroTab) => void;
  period: FinanceiroPeriod;
  periodPreset: FinanceiroPeriodPreset;
  onPeriodPresetChange: (preset: FinanceiroPeriodPreset) => void;
  onPeriodChange: (patch: Partial<FinanceiroPeriod>) => void;
  syncing: boolean;
  onSync: () => void;
  onExport: () => void;
  nfsCount?: number;
}) {
  const {
    tab,
    onTabChange,
    period,
    periodPreset,
    onPeriodPresetChange,
    onPeriodChange,
    syncing,
    onSync,
    onExport,
    nfsCount,
  } = props;

  return (
    <header className="fin-card rounded-2xl p-4 sm:p-6" style={{ boxShadow: 'var(--fin-glow), var(--fin-shadow)' }}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-[var(--fin-text)] sm:text-2xl">
            Financeiro
          </h1>
          <p className="mt-1 text-sm text-[var(--fin-text-secondary)]">
            Visão geral do fluxo de caixa e obrigações.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              {PERIOD_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPeriodPresetChange(p.id)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                    periodPreset === p.id
                      ? 'border-[var(--fin-accent)] bg-[var(--fin-accent-soft)] text-[var(--fin-accent)]'
                      : 'border-[var(--fin-border)] text-[var(--fin-text-secondary)] hover:border-[var(--fin-border-strong)] hover:text-[var(--fin-text)]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {periodPreset === 'personalizado' ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--fin-text-muted)]">
                  De
                  <div className="relative mt-1">
                    <Calendar
                      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--fin-text-muted)]"
                      aria-hidden
                    />
                    <input
                      type="date"
                      value={period.dataInicio}
                      onChange={(e) => onPeriodChange({ dataInicio: e.target.value })}
                      className="fin-input h-9 w-full min-w-[9.5rem] rounded-lg pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-[var(--fin-accent-soft)] sm:text-sm"
                    />
                  </div>
                </label>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--fin-text-muted)]">
                  Até
                  <div className="relative mt-1">
                    <Calendar
                      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--fin-text-muted)]"
                      aria-hidden
                    />
                    <input
                      type="date"
                      value={period.dataFim}
                      onChange={(e) => onPeriodChange({ dataFim: e.target.value })}
                      className="fin-input h-9 w-full min-w-[9.5rem] rounded-lg pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-[var(--fin-accent-soft)] sm:text-sm"
                    />
                  </div>
                </label>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-xs font-semibold text-white transition disabled:opacity-60 sm:text-sm"
            style={{ background: 'var(--fin-accent)' }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            Sincronizar NFs
          </button>

          <button
            type="button"
            onClick={onExport}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-4 text-xs font-semibold text-[var(--fin-text)] transition hover:bg-[var(--fin-card-muted)] sm:text-sm"
            style={{ borderColor: 'var(--fin-border)' }}
          >
            <Download className="h-3.5 w-3.5" />
            Exportar Excel
          </button>
        </div>
      </div>

      <nav
        className="mt-5 flex gap-1 overflow-x-auto border-b sm:gap-2"
        style={{ borderColor: 'var(--fin-border)' }}
        aria-label="Abas do financeiro"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className={`relative shrink-0 border-b-2 px-3 py-2.5 text-xs font-semibold transition sm:px-4 sm:text-sm ${
                active
                  ? 'fin-tab-active text-[var(--fin-accent)]'
                  : 'border-transparent text-[var(--fin-text-secondary)] hover:text-[var(--fin-text)]'
              }`}
              style={active ? { borderBottomColor: 'var(--fin-accent)' } : undefined}
            >
              {t.label}
              {t.id === 'nfs' && nfsCount != null && nfsCount > 0 ? (
                <span
                  className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{
                    background: 'var(--fin-accent-soft)',
                    color: 'var(--fin-accent)',
                  }}
                >
                  {nfsCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
