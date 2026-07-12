'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { GlowButton } from '@/src/components/shell/glow-button';
import { GlassCard } from '@/src/components/shell/glass-card';
import {
  createCrmChannel,
  createCrmFunil,
  createCrmMotivoPerda,
  createCrmStatus,
  deleteCrmChannel,
  deleteCrmFunil,
  deleteCrmMotivoPerda,
  deleteCrmStatus,
  listCrmChannels,
  listCrmFunis,
  listCrmMotivosPerda,
  listCrmStatuses,
  updateCrmChannel,
  updateCrmFunil,
  updateCrmStatus,
  type CrmChannelDto,
  type CrmFunilDto,
  type CrmMotivoPerdaDto,
  type CrmStatusDto,
} from '@/src/services/api/crm-api';

type SettingsTab = 'status' | 'channels' | 'funis' | 'motivos';

export function CrmSettingsModal(props: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const { open, onClose, onChanged } = props;
  const [tab, setTab] = useState<SettingsTab>('status');
  const [statuses, setStatuses] = useState<CrmStatusDto[]>([]);
  const [channels, setChannels] = useState<CrmChannelDto[]>([]);
  const [funis, setFunis] = useState<CrmFunilDto[]>([]);
  const [motivos, setMotivos] = useState<CrmMotivoPerdaDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6366f1');
  const [newRequiresText, setNewRequiresText] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusData, channelData, funilData, motivoData] = await Promise.all([
        listCrmStatuses(),
        listCrmChannels(),
        listCrmFunis(),
        listCrmMotivosPerda(),
      ]);
      setStatuses(statusData);
      setChannels(channelData);
      setFunis(funilData);
      setMotivos(motivoData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar configurações.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setTab('status');
    setNewName('');
    setNewColor('#6366f1');
    setNewRequiresText(false);
    void load();
  }, [open]);

  if (!open) return null;

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      setError('Informe o nome.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (tab === 'status') {
        await createCrmStatus({ name, color: newColor });
      } else if (tab === 'channels') {
        await createCrmChannel({ name, color: newColor });
      } else if (tab === 'funis') {
        await createCrmFunil({ name, color: newColor });
      } else {
        await createCrmMotivoPerda({
          name,
          requiresText: newRequiresText,
          order: motivos.length,
        });
      }
      setNewName('');
      setNewRequiresText(false);
      await load();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar item.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateColor = async (
    kind: Exclude<SettingsTab, 'motivos'>,
    id: string,
    color: string,
  ) => {
    setSaving(true);
    setError(null);
    try {
      if (kind === 'status') await updateCrmStatus(id, { color });
      else if (kind === 'channels') await updateCrmChannel(id, { color });
      else await updateCrmFunil(id, { color });
      await load();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (kind: SettingsTab, id: string, label: string) => {
    if (!window.confirm(`Excluir "${label}"?`)) return;
    setSaving(true);
    setError(null);
    try {
      if (kind === 'status') await deleteCrmStatus(id);
      else if (kind === 'channels') await deleteCrmChannel(id);
      else if (kind === 'funis') await deleteCrmFunil(id);
      else await deleteCrmMotivoPerda(id);
      await load();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir.');
    } finally {
      setSaving(false);
    }
  };

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'status', label: 'Status' },
    { id: 'channels', label: 'Canais de TP' },
    { id: 'funis', label: 'Funis' },
    { id: 'motivos', label: 'Motivos de perda' },
  ];

  const newItemLabel =
    tab === 'status'
      ? 'status'
      : tab === 'channels'
        ? 'canal'
        : tab === 'funis'
          ? 'funil'
          : 'motivo';

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <GlassCard className="border-white/[0.12] p-4 shadow-2xl sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Configurações do CRM
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

          <div className="mt-4 inline-flex flex-wrap rounded-xl border border-white/10 bg-white/5 p-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setNewName('');
                  setNewColor(item.id === 'channels' ? '#22c55e' : '#6366f1');
                  setNewRequiresText(false);
                  setError(null);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  tab === item.id
                    ? 'bg-white text-slate-950'
                    : 'text-[var(--text-secondary)] hover:bg-white/10'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex min-h-[10rem] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <>
              <div className="mt-4 space-y-2">
                {tab === 'motivos'
                  ? motivos.map((row) => (
                      <div
                        key={row.id}
                        className="flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">
                          {row.name}
                        </span>
                        {row.requiresText ? (
                          <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-200">
                            Texto livre
                          </span>
                        ) : null}
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleDelete('motivos', row.id, row.name)}
                          className="rounded-lg p-1.5 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                          aria-label={`Excluir ${row.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  : (tab === 'status' ? statuses : tab === 'channels' ? channels : funis).map(
                      (row) => (
                        <div
                          key={row.id}
                          className="flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2"
                        >
                          <input
                            type="color"
                            value={
                              'color' in row && row.color
                                ? row.color
                                : tab === 'channels'
                                  ? '#22c55e'
                                  : '#6366f1'
                            }
                            onChange={(e) =>
                              void handleUpdateColor(tab as Exclude<SettingsTab, 'motivos'>, row.id, e.target.value)
                            }
                            disabled={saving}
                            className="h-8 w-10 shrink-0 cursor-pointer rounded border border-[var(--border-color)] bg-transparent"
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">
                            {row.name}
                          </span>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void handleDelete(tab, row.id, row.name)}
                            className="rounded-lg p-1.5 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                            aria-label={`Excluir ${row.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ),
                    )}
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-2">
                <label className="min-w-[12rem] flex-1 text-xs font-medium text-[var(--text-secondary)]">
                  Novo {newItemLabel}
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                  />
                </label>
                {tab === 'motivos' ? (
                  <label className="flex items-center gap-2 pb-2 text-xs font-medium text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={newRequiresText}
                      onChange={(e) => setNewRequiresText(e.target.checked)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    Exige texto livre
                  </label>
                ) : (
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Cor
                    <input
                      type="color"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="mt-1 block h-10 w-12 cursor-pointer rounded-lg border border-[var(--border-color)]"
                    />
                  </label>
                )}
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
            </>
          )}

          {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
        </GlassCard>
      </div>
    </div>
  );
}
