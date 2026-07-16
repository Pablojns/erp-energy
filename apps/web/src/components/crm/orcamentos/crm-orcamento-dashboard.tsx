'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  formatQuoteCurrency,
  getQuotesDashboard,
  type QuoteDashboardDto,
  type QuoteDashboardPeriod,
} from '@/src/services/api/quotes-api';

const PERIODS: Array<{ id: QuoteDashboardPeriod; label: string }> = [
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' },
  { id: 'all', label: 'Todo período' },
];

export function CrmOrcamentoDashboard() {
  const [period, setPeriod] = useState<QuoteDashboardPeriod>('30d');
  const [data, setData] = useState<QuoteDashboardDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void getQuotesDashboard(period)
      .then((res) => {
        if (!controller.signal.aborted) setData(res);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar dashboard.');
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [period]);

  return (
    <section className="erp-module-panel flex min-h-0 flex-1 flex-col overflow-auto p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriod(p.id)}
            className={`erp-focus-ring rounded-lg px-3 py-1.5 text-xs font-semibold ${
              period === p.id
                ? 'bg-[#2AACE2] text-white'
                : 'bg-[var(--erp-bg)] text-[var(--erp-fg-muted)]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error ? <div className="erp-alert-danger mb-3">{error}</div> : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--erp-fg-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando métricas...
        </div>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: 'Valor em aberto',
                value: formatQuoteCurrency(data.resumo.valorAberto),
              },
              {
                label: 'Ticket médio',
                value: formatQuoteCurrency(data.resumo.ticketMedio),
              },
              {
                label: 'Taxa de conversão',
                value: `${data.resumo.taxaConversao.toLocaleString('pt-BR')}%`,
              },
              {
                label: 'Total de orçamentos',
                value: String(data.resumo.totalOrcamentos),
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-[var(--erp-border)] bg-white p-4 shadow-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-fg-muted)]">
                  {card.label}
                </p>
                <p className="mt-2 text-xl font-semibold text-[var(--erp-fg)]">
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-[var(--erp-border)] bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-[var(--erp-fg)]">
              Performance por vendedor
            </h3>
            {data.porVendedor.length === 0 ? (
              <p className="text-sm text-[var(--erp-fg-muted)]">
                Sem dados no período.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-[var(--erp-fg-muted)]">
                    <tr className="border-b border-[var(--erp-border)]">
                      <th className="px-2 py-2 font-semibold">Vendedor</th>
                      <th className="px-2 py-2 font-semibold">Qtd</th>
                      <th className="px-2 py-2 font-semibold">Valor total</th>
                      <th className="px-2 py-2 font-semibold">Conversão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.porVendedor.map((row) => (
                      <tr
                        key={row.responsavelId ?? 'none'}
                        className="border-b border-[var(--erp-border)]/70"
                      >
                        <td className="px-2 py-2 font-medium">{row.nome}</td>
                        <td className="px-2 py-2">{row.quantidade}</td>
                        <td className="px-2 py-2">
                          {formatQuoteCurrency(row.valorTotal)}
                        </td>
                        <td className="px-2 py-2">
                          {row.taxaConversao.toLocaleString('pt-BR')}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
