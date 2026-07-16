'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  formatQuoteCurrency,
  listQuotes,
  QUOTE_STATUS_BADGE_CLASS,
  QUOTE_STATUS_LABEL,
  type QuoteDto,
} from '@/src/services/api/quotes-api';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR');
}

export function CrmCardLinkedQuotes(props: { cardId: string }) {
  const [rows, setRows] = useState<QuoteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void listQuotes({ linkedCrmCardId: props.cardId, pageSize: 50 })
      .then((res) => {
        if (!controller.signal.aborted) setRows(res.data);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar orçamentos.');
        setRows([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [props.cardId]);

  return (
    <section className="mt-5">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--text-secondary)]">
        Orçamentos vinculados
      </h3>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-4 text-sm text-[var(--text-muted)]">
          Nenhum orçamento vinculado a este lead.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-color)]">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="bg-[var(--input-bg)] text-xs uppercase tracking-wide text-[var(--text-secondary)]">
              <tr>
                <th className="px-3 py-2 font-semibold">Código</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Total</th>
                <th className="px-3 py-2 font-semibold">Data</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--border-color)]">
                  <td className="px-3 py-2 font-semibold text-[#2AACE2]">
                    {row.code}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        QUOTE_STATUS_BADGE_CLASS[row.status] ??
                        'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {QUOTE_STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{formatQuoteCurrency(row.total)}</td>
                  <td className="px-3 py-2">{formatDate(row.requestDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
