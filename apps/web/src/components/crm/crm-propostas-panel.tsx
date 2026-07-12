'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileDown, Loader2, Pencil, Plus } from 'lucide-react';
import { CrmPropostaFormModal } from '@/src/components/crm/crm-proposta-form-modal';
import { GlowButton } from '@/src/components/shell/glow-button';
import {
  CRM_PROPOSTA_STATUS_BADGE,
  CRM_PROPOSTA_STATUS_LABEL,
  aceitarCrmProposta,
  downloadCrmPropostaPdf,
  formatCrmCurrency,
  listCrmPropostas,
  type CrmPropostaDto,
} from '@/src/services/api/crm-api';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR');
}

export function CrmPropostasPanel(props: {
  cardId: string;
  onCardUpdated: () => void | Promise<void>;
}) {
  const { cardId, onCardUpdated } = props;
  const [propostas, setPropostas] = useState<CrmPropostaDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CrmPropostaDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listCrmPropostas(cardId);
      setPropostas(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar propostas.');
      setPropostas([]);
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePdf = async (proposta: CrmPropostaDto) => {
    setBusyId(proposta.id);
    setError(null);
    try {
      await downloadCrmPropostaPdf(proposta.id, proposta.numero);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar PDF.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAceitar = async (proposta: CrmPropostaDto) => {
    if (!window.confirm(`Marcar proposta ${proposta.numero} como aceita?`)) return;
    setBusyId(proposta.id);
    setError(null);
    try {
      await aceitarCrmProposta(proposta.id);
      await load();
      await onCardUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao aceitar proposta.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--text-secondary)]">
          Propostas comerciais
        </h3>
        <GlowButton
          variant="secondary"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Nova proposta
        </GlowButton>
      </div>

      {loading ? (
        <div className="flex min-h-[8rem] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : propostas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border-color)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
          Nenhuma proposta criada para este lead.
        </p>
      ) : (
        <div className="space-y-2">
          {propostas.map((proposta) => {
            const busy = busyId === proposta.id;
            return (
              <article
                key={proposta.id}
                className="rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--text-primary)]">
                      {proposta.titulo}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {proposta.numero} · {formatDate(proposta.createdAt)}
                      {proposta.validade
                        ? ` · Válida até ${formatDate(proposta.validade)}`
                        : ''}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${CRM_PROPOSTA_STATUS_BADGE[proposta.status]}`}
                      >
                        {CRM_PROPOSTA_STATUS_LABEL[proposta.status]}
                      </span>
                      <span className="text-sm font-bold text-emerald-300">
                        {formatCrmCurrency(proposta.total)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditing(proposta);
                        setFormOpen(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--erp-bg)] disabled:opacity-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handlePdf(proposta)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--erp-bg)] disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileDown className="h-3.5 w-3.5" />
                      )}
                      Gerar PDF
                    </button>
                    {proposta.status !== 'ACEITA' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleAceitar(proposta)}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Marcar como Aceita
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}

      <CrmPropostaFormModal
        open={formOpen}
        cardId={cardId}
        proposta={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={async () => {
          await load();
        }}
      />
    </section>
  );
}
