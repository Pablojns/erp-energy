'use client';

import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { GlassCard } from '@/src/components/shell/glass-card';
import { GlowButton } from '@/src/components/shell/glow-button';
import {
  createPurchaseStage,
  deletePurchaseStage,
  listPurchaseStages,
  updatePurchaseStage,
} from './compras-api';
import type { PurchaseStage } from './compras-types';

/** Administração das etapas do Kanban de Compras (ADMIN). */
export function ComprasStagesSettingsModal(props: {
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const { onClose, onChanged } = props;
  const [stages, setStages] = useState<PurchaseStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDetails, setEditDetails] = useState(false);
  const [editReason, setEditReason] = useState(false);

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6366f1');
  const [newDetails, setNewDetails] = useState(false);
  const [newReason, setNewReason] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setStages(await listPurchaseStages());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar etapas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const startEdit = (stage: PurchaseStage) => {
    setEditingId(stage.id);
    setEditName(stage.name);
    setEditDetails(stage.requiresPurchaseDetails);
    setEditReason(stage.requiresReason);
    setError(null);
  };

  const handleSaveEdit = async (id: string) => {
    const name = editName.trim();
    if (!name) {
      setError('Informe o nome da etapa.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updatePurchaseStage(id, {
        name,
        requiresPurchaseDetails: editDetails,
        requiresReason: editReason,
      });
      setEditingId(null);
      await load();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar etapa.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateColor = async (id: string, color: string) => {
    setSaving(true);
    setError(null);
    try {
      await updatePurchaseStage(id, { color });
      await load();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar cor.');
    } finally {
      setSaving(false);
    }
  };

  const handleReorder = async (id: string, direction: 'up' | 'down') => {
    const index = stages.findIndex((row) => row.id === id);
    if (index < 0) return;
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= stages.length) return;

    const current = stages[index]!;
    const swap = stages[swapIndex]!;

    setSaving(true);
    setError(null);
    try {
      await updatePurchaseStage(current.id, { order: swap.order });
      await updatePurchaseStage(swap.id, { order: current.order });
      await load();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao reordenar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (stage: PurchaseStage) => {
    if (!window.confirm(`Excluir a etapa "${stage.name}"?`)) return;
    setSaving(true);
    setError(null);
    try {
      await deletePurchaseStage(stage.id);
      await load();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir etapa.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      setError('Informe o nome da etapa.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createPurchaseStage({
        name,
        color: newColor,
        requiresPurchaseDetails: newDetails,
        requiresReason: newReason,
      });
      setNewName('');
      setNewDetails(false);
      setNewReason(false);
      await load();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar etapa.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <GlassCard className="max-h-[90vh] overflow-y-auto border-gray-200 p-4 shadow-2xl sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Etapas de Compras
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

          {loading ? (
            <div className="flex min-h-[10rem] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <>
              <div className="mt-4 space-y-2">
                {stages.map((stage, index) => {
                  const editing = editingId === stage.id;
                  return (
                    <div
                      key={stage.id}
                      className="rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={stage.color ?? '#6366f1'}
                          onChange={(e) =>
                            void handleUpdateColor(stage.id, e.target.value)
                          }
                          disabled={saving}
                          className="h-8 w-10 shrink-0 cursor-pointer rounded border border-[var(--border-color)] bg-transparent"
                          aria-label={`Cor da etapa ${stage.name}`}
                        />

                        {editing ? (
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            disabled={saving}
                            autoFocus
                            className="min-w-0 flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-sm text-[var(--text-primary)] outline-none"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleSaveEdit(stage.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                        ) : (
                          <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">
                            {stage.name}
                          </span>
                        )}

                        {!editing && stage.requiresPurchaseDetails ? (
                          <span className="shrink-0 rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-800">
                            Valor/data
                          </span>
                        ) : null}
                        {!editing && stage.requiresReason ? (
                          <span className="shrink-0 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                            Motivo
                          </span>
                        ) : null}

                        {editing ? (
                          <GlowButton
                            variant="secondary"
                            disabled={saving}
                            onClick={() => void handleSaveEdit(stage.id)}
                          >
                            Salvar
                          </GlowButton>
                        ) : (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => startEdit(stage)}
                            className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-card)] disabled:opacity-30"
                            aria-label={`Editar ${stage.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}

                        <div className="flex shrink-0 flex-col gap-0.5">
                          <button
                            type="button"
                            disabled={saving || index === 0}
                            onClick={() => void handleReorder(stage.id, 'up')}
                            className="rounded p-0.5 text-[var(--text-secondary)] hover:bg-[var(--bg-card)] disabled:opacity-30"
                            aria-label="Mover para cima"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={saving || index >= stages.length - 1}
                            onClick={() => void handleReorder(stage.id, 'down')}
                            className="rounded p-0.5 text-[var(--text-secondary)] hover:bg-[var(--bg-card)] disabled:opacity-30"
                            aria-label="Mover para baixo"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleDelete(stage)}
                          className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-100 disabled:opacity-30"
                          aria-label={`Excluir ${stage.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {editing ? (
                        <div className="mt-2 flex flex-wrap gap-4 pl-12">
                          <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
                            <input
                              type="checkbox"
                              checked={editReason}
                              onChange={(e) => setEditReason(e.target.checked)}
                              className="h-4 w-4 accent-[var(--accent)]"
                            />
                            Pede motivo ao mover pra cá
                          </label>
                          <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
                            <input
                              type="checkbox"
                              checked={editDetails}
                              onChange={(e) => setEditDetails(e.target.checked)}
                              className="h-4 w-4 accent-[var(--accent)]"
                            />
                            Pede valor e data de compra ao mover pra cá
                          </label>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 rounded-xl border border-dashed border-[var(--border-color)] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  Nova etapa
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="min-w-[12rem] flex-1 text-xs font-medium text-[var(--text-secondary)]">
                    Nome
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                    />
                  </label>
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Cor
                    <input
                      type="color"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="mt-1 block h-10 w-12 cursor-pointer rounded-lg border border-[var(--border-color)]"
                    />
                  </label>
                  <GlowButton
                    variant="secondary"
                    disabled={saving}
                    onClick={() => void handleCreate()}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        Adicionar
                      </>
                    )}
                  </GlowButton>
                </div>
                <div className="mt-2 flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={newReason}
                      onChange={(e) => setNewReason(e.target.checked)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    Pede motivo ao mover pra cá?
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={newDetails}
                      onChange={(e) => setNewDetails(e.target.checked)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    Pede valor e data de compra ao mover pra cá?
                  </label>
                </div>
              </div>
            </>
          )}

          {error ? <p className="mt-3 text-sm text-rose-500">{error}</p> : null}
        </GlassCard>
      </div>
    </div>
  );
}
