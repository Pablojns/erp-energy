'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { GlowButton } from '@/src/components/shell/glow-button';
import { GlassCard } from '@/src/components/shell/glass-card';
import { upsertCrmMeta, type CrmMetasMesDto } from '@/src/services/api/crm-api';

export function CrmMetasModal(props: {
  open: boolean;
  initial: CrmMetasMesDto | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { open, initial, onClose, onSaved } = props;
  const [metaLeads, setMetaLeads] = useState('0');
  const [metaFechamentos, setMetaFechamentos] = useState('0');
  const [metaValor, setMetaValor] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !initial) return;
    setMetaLeads(String(initial.metaLeads));
    setMetaFechamentos(String(initial.metaFechamentos));
    setMetaValor(String(initial.metaValor));
    setError(null);
  }, [open, initial]);

  if (!open || !initial) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await upsertCrmMeta({
        mes: initial.mes,
        ano: initial.ano,
        metaLeads: Number(metaLeads) || 0,
        metaFechamentos: Number(metaFechamentos) || 0,
        metaValor: Number(metaValor.replace(',', '.')) || 0,
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar metas.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <GlassCard className="border-white/[0.12] p-4 shadow-2xl">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Metas do mês
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                {String(initial.mes).padStart(2, '0')}/{initial.ano}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--input-bg)]"
              onClick={onClose}
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">
              Meta de leads
              <input
                type="number"
                min={0}
                value={metaLeads}
                onChange={(e) => setMetaLeads(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-[var(--text-secondary)]">
              Meta de fechamentos
              <input
                type="number"
                min={0}
                value={metaFechamentos}
                onChange={(e) => setMetaFechamentos(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-[var(--text-secondary)]">
              Meta de valor (R$)
              <input
                value={metaValor}
                onChange={(e) => setMetaValor(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
              />
            </label>
          </div>

          {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}

          <div className="mt-4 flex justify-end gap-2">
            <GlowButton variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </GlowButton>
            <GlowButton variant="primary" disabled={saving} onClick={() => void handleSave()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar metas'}
            </GlowButton>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
