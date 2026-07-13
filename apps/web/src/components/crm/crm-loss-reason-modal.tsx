'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { GlowButton } from '@/src/components/shell/glow-button';
import { GlassCard } from '@/src/components/shell/glass-card';
import { listCrmMotivosPerda, type CrmMotivoPerdaDto } from '@/src/services/api/crm-api';

export function CrmLossReasonModal(props: {
  open: boolean;
  onClose: () => void;
  onConfirm: (motivoPerdaId: string, motivoPerdaTexto: string | null) => void | Promise<void>;
  saving?: boolean;
}) {
  const { open, onClose, onConfirm, saving = false } = props;
  const [motivos, setMotivos] = useState<CrmMotivoPerdaDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [otherText, setOtherText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedId('');
    setOtherText('');
    setError(null);
    setLoading(true);
    void listCrmMotivosPerda()
      .then(setMotivos)
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Erro ao carregar motivos.'),
      )
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const selected = motivos.find((m) => m.id === selectedId);

  const handleConfirm = () => {
    if (!selectedId) {
      setError('Selecione um motivo de perda.');
      return;
    }
    if (selected?.requiresText && !otherText.trim()) {
      setError('Descreva o motivo de perda.');
      return;
    }
    setError(null);
    void onConfirm(
      selectedId,
      selected?.requiresText ? otherText.trim() : null,
    );
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <GlassCard className="border-gray-200 p-4 shadow-2xl sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Motivo de perda
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--input-bg)]"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Selecione o motivo antes de marcar o lead como perdido.
          </p>

          {loading ? (
            <div className="mt-6 flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {motivos.map((motivo) => (
                <label
                  key={motivo.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                    selectedId === motivo.id
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                      : 'border-[var(--border-color)] hover:bg-[var(--input-bg)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="motivo-perda"
                    checked={selectedId === motivo.id}
                    onChange={() => {
                      setSelectedId(motivo.id);
                      setError(null);
                    }}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="text-sm text-[var(--text-primary)]">{motivo.name}</span>
                </label>
              ))}
              {selected?.requiresText ? (
                <textarea
                  value={otherText}
                  onChange={(e) => {
                    setOtherText(e.target.value);
                    setError(null);
                  }}
                  placeholder="Descreva o motivo..."
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                />
              ) : null}
            </div>
          )}

          {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}

          <div className="mt-5 flex justify-end gap-2">
            <GlowButton variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </GlowButton>
            <GlowButton
              variant="primary"
              onClick={handleConfirm}
              disabled={saving || loading}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar perda'}
            </GlowButton>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
