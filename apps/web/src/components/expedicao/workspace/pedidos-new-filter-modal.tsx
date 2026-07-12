'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { ExpeditionPedidosPreset } from '@/src/components/expedicao/workspace/pedidos-saved-filter-types';
import { saveNamedFilter } from '@/src/lib/saved-filters';

type PedidosNewFilterModalProps = {
  isOpen: boolean;
  storageKey: string;
  preset: ExpeditionPedidosPreset;
  onClose: () => void;
  onSaved: () => void;
};

export function PedidosNewFilterModal(props: PedidosNewFilterModalProps) {
  const { isOpen, storageKey, preset, onClose, onSaved } = props;
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    if (saving) return;
    setName('');
    setError(null);
    onClose();
  };

  const handleSave = () => {
    setSaving(true);
    setError(null);
    try {
      saveNamedFilter(storageKey, name, preset);
      onSaved();
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar filtro.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--color-overlay)]"
        aria-label="Fechar"
        onClick={handleClose}
        disabled={saving}
      />
      <div
        className="relative w-full max-w-md rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl"
        role="dialog"
        aria-labelledby="pedidos-new-filter-title"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            id="pedidos-new-filter-title"
            className="text-lg font-semibold text-[var(--text-primary)]"
          >
            Salvar filtro
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="rounded-md p-1 text-[var(--text-secondary)] hover:bg-[var(--input-bg)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Os filtros atuais (origem, status, campo e ordenação) serão salvos com o nome abaixo.
          </p>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-[var(--text-secondary)]">
              Nome do filtro
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder='Ex.: "Pedidos atrasados WEG"'
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)]"
              autoFocus
            />
          </label>

          {error ? <p className="text-sm text-rose-500">{error}</p> : null}
        </div>

        <div className="flex gap-3 border-t border-[var(--border-color)] px-5 py-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-[var(--border-color)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-inverse)] disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar filtro
          </button>
        </div>
      </div>
    </div>
  );
}

// Re-export for backward compatibility with existing imports.
export type { ExpeditionPedidosPreset } from '@/src/components/expedicao/workspace/pedidos-saved-filter-types';
