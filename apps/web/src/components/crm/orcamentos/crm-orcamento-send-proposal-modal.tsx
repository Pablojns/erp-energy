'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { sendQuoteProposalEmail } from '@/src/services/api/quotes-api';

const SUBJECT = 'Proposta comercial - Brindes Corporativos';

export function CrmOrcamentoSendProposalModal(props: {
  open: boolean;
  quoteId: string;
  proposalId: string;
  defaultEmail: string;
  defaultContactName: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState(props.defaultEmail);
  const [contactName, setContactName] = useState(props.defaultContactName);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!props.open) return null;

  const handleSend = async () => {
    if (!to.trim() || !to.includes('@')) {
      setError('Informe um e-mail válido.');
      return;
    }
    setSending(true);
    setError(null);
    setSuccess(false);
    try {
      await sendQuoteProposalEmail(props.quoteId, props.proposalId, {
        to: to.trim(),
        contactName: contactName.trim() || null,
      });
      setSuccess(true);
      props.onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar e-mail.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="erp-modal-overlay">
      <button
        type="button"
        className="erp-modal-backdrop"
        onClick={props.onClose}
        aria-label="Fechar"
      />
      <section className="erp-modal-panel relative w-full max-w-md">
        <button
          type="button"
          onClick={props.onClose}
          className="absolute right-3 top-3 rounded-md p-1.5 text-[var(--erp-fg-muted)] hover:bg-[var(--erp-bg)]"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="pr-8 text-base font-semibold text-[var(--erp-fg)]">
          Enviar proposta por e-mail
        </h2>
        <p className="mt-1 text-xs text-[var(--erp-fg-muted)]">
          Confirme o destinatário antes de enviar.
        </p>

        <label className="mt-4 block text-xs font-medium text-[var(--erp-fg-muted)]">
          Para
          <input
            type="email"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setSuccess(false);
            }}
            className="erp-module-input mt-1"
            disabled={sending}
          />
        </label>
        <label className="mt-3 block text-xs font-medium text-[var(--erp-fg-muted)]">
          Nome do contato
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className="erp-module-input mt-1"
            disabled={sending}
          />
        </label>

        <div className="mt-3 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-bg)] px-3 py-2 text-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--erp-fg-muted)]">
            Assunto
          </p>
          <p className="mt-0.5 text-[var(--erp-fg)]">{SUBJECT}</p>
        </div>

        {error ? <div className="erp-alert-danger mt-3">{error}</div> : null}
        {success ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Proposta enviada com sucesso.
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onClose}
            className="erp-focus-ring erp-btn erp-btn-ghost erp-btn--md"
            disabled={sending}
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || success}
            className="erp-focus-ring erp-btn erp-btn-primary erp-btn--md disabled:opacity-50"
          >
            {sending ? <Loader2 className="erp-icon-sm animate-spin" /> : null}
            Enviar
          </button>
        </div>
      </section>
    </div>
  );
}
