'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { GlowButton } from '@/src/components/shell/glow-button';
import { GlassCard } from '@/src/components/shell/glass-card';
import { createCrmFunil } from '@/src/services/api/crm-api';

export function CrmCreateFunilModal(props: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const { open, onClose, onCreated } = props;
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setColor('#6366f1');
    setError(null);
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    const nm = name.trim();
    if (!nm) {
      setError('Informe o nome do funil.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createCrmFunil({ name: nm, color });
      await onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar funil.');
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
        <GlassCard className="border-white/[0.12] p-4 shadow-2xl sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Criar funil
            </h2>
            <button
              type="button"
              className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--input-bg)]"
              onClick={onClose}
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Nome
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none"
                placeholder="Ex.: Lead, Orçamento, Fechado"
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Cor
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)]"
              />
              <input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none"
              />
            </label>
            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <GlowButton variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </GlowButton>
            <GlowButton variant="primary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando
                </>
              ) : (
                'Criar funil'
              )}
            </GlowButton>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
