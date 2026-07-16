'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, Plus } from 'lucide-react';
import { EmptyState } from '@/src/components/ui/empty-state';
import {
  createQuoteProposal,
  downloadQuoteProposalPdf,
  formatQuoteCurrency,
  listQuoteProposals,
  type QuoteDto,
  type QuoteProposalDto,
} from '@/src/services/api/quotes-api';

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

export function CrmOrcamentoProposalsTab(props: {
  quote: QuoteDto;
  onError: (message: string | null) => void;
  onProposalCreated?: (proposalId: string) => void;
}) {
  const [rows, setRows] = useState<QuoteProposalDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    props.onError(null);
    try {
      const data = await listQuoteProposals(props.quote.id);
      setRows(data);
    } catch (err) {
      props.onError(
        err instanceof Error ? err.message : 'Falha ao carregar propostas.',
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [props.quote.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleGenerate = async () => {
    setGenerating(true);
    props.onError(null);
    try {
      const result = await createQuoteProposal(props.quote.id, {
        contactEmail: props.quote.customerEmail,
        contactName: props.quote.customerName,
      });
      await load();
      if (result.proposalId) props.onProposalCreated?.(result.proposalId);
    } catch (err) {
      props.onError(
        err instanceof Error ? err.message : 'Falha ao gerar proposta.',
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (proposalId: string) => {
    setBusyId(proposalId);
    props.onError(null);
    try {
      await downloadQuoteProposalPdf(props.quote.id, proposalId);
    } catch (err) {
      props.onError(
        err instanceof Error ? err.message : 'Falha ao baixar PDF.',
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--erp-border)] bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--erp-fg)]">
          Histórico de propostas
        </h3>
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={generating}
          className="erp-focus-ring erp-btn erp-btn-primary erp-btn--md disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="erp-icon-sm animate-spin" />
          ) : (
            <Plus className="erp-icon-sm" aria-hidden />
          )}
          Gerar Nova Proposta
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--erp-fg-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhuma proposta"
          description="Gere a primeira proposta em PDF a partir deste orçamento."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-[var(--erp-fg-muted)]">
              <tr className="border-b border-[var(--erp-border)]">
                <th className="px-2 py-2 font-semibold">Data</th>
                <th className="px-2 py-2 font-semibold">E-mail enviado</th>
                <th className="px-2 py-2 font-semibold">Criada por</th>
                <th className="px-2 py-2 font-semibold">Contato</th>
                <th className="px-2 py-2 font-semibold">E-mail contato</th>
                <th className="px-2 py-2 font-semibold">Total</th>
                <th className="px-2 py-2 font-semibold">Ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--erp-border)]/70"
                >
                  <td className="px-2 py-2">
                    {formatDateTime(row.sentAt ?? row.createdAt)}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        row.emailSent
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {row.emailSent ? 'Sim' : 'Não'}
                    </span>
                  </td>
                  <td className="px-2 py-2">{row.createdBy ?? '—'}</td>
                  <td className="px-2 py-2">{row.contactName ?? '—'}</td>
                  <td className="px-2 py-2">{row.contactEmail ?? '—'}</td>
                  <td className="px-2 py-2 font-medium">
                    {formatQuoteCurrency(row.total)}
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => void handleDownload(row.id)}
                      disabled={busyId === row.id}
                      className="erp-focus-ring erp-btn erp-btn-secondary erp-btn--sm disabled:opacity-50"
                    >
                      {busyId === row.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      Baixar PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
