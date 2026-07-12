'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Trash2, X, XCircle } from 'lucide-react';
import { CrmActivityTimeline } from '@/src/components/crm/crm-activity-timeline';
import { CrmLeadScoreThermometer } from '@/src/components/crm/crm-lead-score';
import { CrmLossReasonModal } from '@/src/components/crm/crm-loss-reason-modal';
import {
  appendQuickNote,
  buildCrmActivityTimeline,
} from '@/src/components/crm/crm-helpers';
import { GlowButton } from '@/src/components/shell/glow-button';
import { GlassCard } from '@/src/components/shell/glass-card';
import {
  CRM_CARD_ORIGINS,
  CRM_ORIGIN_BADGE_CLASS,
  CRM_ORIGIN_LABEL,
  calcNegotiationDays,
  deleteCrmCard,
  findCrmStatusByName,
  formatCrmCurrency,
  getCrmCard,
  mergeTouchpoints,
  updateCrmCard,
  upsertCrmTouchpoints,
  type CrmCardDto,
  type CrmCardOrigin,
  type CrmChannelDto,
  type CrmFunilDto,
  type CrmStatusDto,
  type CrmTouchpointInput,
  type CrmUserDto,
} from '@/src/services/api/crm-api';

export function CrmCardDetailModal(props: {
  cardId: string | null;
  funis: CrmFunilDto[];
  statuses: CrmStatusDto[];
  channels: CrmChannelDto[];
  users: CrmUserDto[];
  onClose: () => void;
  onUpdated: () => void | Promise<void>;
}) {
  const { cardId, funis, statuses, channels, users, onClose, onUpdated } = props;
  const [card, setCard] = useState<CrmCardDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [value, setValue] = useState('');
  const [origin, setOrigin] = useState<CrmCardOrigin>('FRIO');
  const [statusId, setStatusId] = useState('');
  const [observations, setObservations] = useState('');
  const [whatsappLog, setWhatsappLog] = useState('');
  const [funilId, setFunilId] = useState('');
  const [responsavelId, setResponsavelId] = useState('');
  const [touchpoints, setTouchpoints] = useState<CrmTouchpointInput[]>([]);
  const [quickNote, setQuickNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lossModalOpen, setLossModalOpen] = useState(false);

  useEffect(() => {
    if (!cardId) {
      setCard(null);
      return;
    }
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getCrmCard(cardId);
        if (controller.signal.aborted) return;
        setCard(data);
        setName(data.name);
        setPhone(data.phone ?? '');
        setEmail(data.email ?? '');
        setValue(data.value ?? '');
        setOrigin(data.origin);
        setStatusId(data.status);
        setObservations(data.observations ?? '');
        setWhatsappLog(data.whatsappLog ?? '');
        setFunilId(data.funilId);
        setResponsavelId(data.responsavelId ?? '');
        setTouchpoints(mergeTouchpoints(data.touchpoints));
        setQuickNote('');
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Erro ao carregar lead.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [cardId]);

  const doneCount = useMemo(
    () => touchpoints.filter((tp) => tp.done).length,
    [touchpoints],
  );

  const negotiationDays = useMemo(
    () => (card ? calcNegotiationDays(card) : 0),
    [card],
  );

  const selectedStatus = statuses.find((s) => s.id === statusId);

  const activityItems = useMemo(() => {
    if (!card) return [];
    return buildCrmActivityTimeline(
      {
        createdAt: card.createdAt,
        notes: card.notes,
        touchpoints: card.touchpoints,
      },
      channels,
    );
  }, [card, channels]);

  const addQuickNote = async () => {
    if (!card || !quickNote.trim()) return;
    const nextNotes = appendQuickNote(card.notes, quickNote);
    setSaving(true);
    setError(null);
    try {
      const updated = await updateCrmCard(card.id, { notes: nextNotes });
      setCard(updated);
      setQuickNote('');
      await onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar nota.');
    } finally {
      setSaving(false);
    }
  };

  if (!cardId) return null;

  const isPerdido = selectedStatus?.name === 'Perdido';

  const updateTouchpoint = (number: number, patch: Partial<CrmTouchpointInput>) => {
    setTouchpoints((current) =>
      current.map((tp) => (tp.number === number ? { ...tp, ...patch } : tp)),
    );
  };

  const save = async (extra?: {
    status?: string;
    closeAfter?: boolean;
    motivoPerdaId?: string | null;
    motivoPerdaTexto?: string | null;
  }) => {
    if (!card) return;
    setSaving(true);
    setError(null);
    try {
      const parsedValue = value.trim() ? Number(value.replace(',', '.')) : null;
      await updateCrmCard(card.id, {
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        value: parsedValue != null && Number.isFinite(parsedValue) ? parsedValue : null,
        origin,
        status: extra?.status ?? statusId,
        observations: observations.trim() || null,
        whatsappLog: whatsappLog.trim() || null,
        funilId,
        responsavelId: responsavelId || null,
        touchPoints: doneCount,
        motivoPerdaId: extra?.motivoPerdaId,
        motivoPerdaTexto: extra?.motivoPerdaTexto,
      });
      await upsertCrmTouchpoints(card.id, touchpoints);
      const refreshed = await getCrmCard(card.id);
      setCard(refreshed);
      setTouchpoints(mergeTouchpoints(refreshed.touchpoints));
      await onUpdated();
      if (extra?.closeAfter) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar card.');
    } finally {
      setSaving(false);
    }
  };

  const markStatus = async (statusName: 'Fechado' | 'Perdido') => {
    const target = findCrmStatusByName(statuses, statusName);
    if (!target) {
      setError(`Status "${statusName}" não encontrado.`);
      return;
    }
    if (statusName === 'Perdido') {
      setStatusId(target.id);
      setLossModalOpen(true);
      return;
    }
    setStatusId(target.id);
    await save({ status: target.id, closeAfter: true });
  };

  const confirmLoss = async (motivoPerdaId: string, motivoPerdaTexto: string | null) => {
    const target = findCrmStatusByName(statuses, 'Perdido');
    if (!target) {
      setError('Status "Perdido" não encontrado.');
      return;
    }
    setStatusId(target.id);
    await save({
      status: target.id,
      closeAfter: true,
      motivoPerdaId,
      motivoPerdaTexto,
    });
    setLossModalOpen(false);
  };

  const handleDelete = async () => {
    if (!card || !window.confirm('Excluir este lead?')) return;
    setSaving(true);
    try {
      await deleteCrmCard(card.id);
      await onUpdated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir card.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="h-auto max-h-[92vh] w-full max-w-4xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <GlassCard className="border-white/[0.12] p-4 shadow-2xl sm:p-5">
          {loading || !card ? (
            <div className="flex min-h-[12rem] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] pb-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                    {name || card.name}
                  </h2>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {selectedStatus ? (
                      isPerdido ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/70 bg-rose-500/25 px-3 py-1 text-xs font-bold uppercase tracking-wide text-rose-100">
                          <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {selectedStatus.name}
                        </span>
                      ) : (
                        <span
                          className="inline-flex rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide"
                          style={{
                            borderColor: `${selectedStatus.color}88`,
                            backgroundColor: `${selectedStatus.color}33`,
                            color: selectedStatus.color,
                          }}
                        >
                          {selectedStatus.name}
                        </span>
                      )
                    ) : null}
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${CRM_ORIGIN_BADGE_CLASS[origin]}`}
                    >
                      {CRM_ORIGIN_LABEL[origin]}
                    </span>
                    <span className="text-xs font-medium text-[var(--text-muted)]">
                      {negotiationDays.toLocaleString('pt-BR', {
                        maximumFractionDigits: 1,
                      })}{' '}
                      dias de negociação
                    </span>
                  </div>
                  <div className="mt-3 max-w-xs">
                    <CrmLeadScoreThermometer score={card.score ?? 0} prominent />
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--input-bg)]"
                  onClick={onClose}
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {isPerdido && card.motivoPerdaMeta ? (
                <div className="mt-4 flex gap-3 rounded-xl border border-rose-400/50 bg-rose-500/15 px-4 py-3">
                  <AlertTriangle
                    className="mt-0.5 h-5 w-5 shrink-0 text-rose-300"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-rose-100">
                      Motivo da perda: {card.motivoPerdaMeta.name}
                    </p>
                    {card.motivoPerdaTexto ? (
                      <p className="mt-1 text-sm leading-relaxed text-rose-50/90">
                        {card.motivoPerdaTexto}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <section className="mt-5">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                  Informações
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                  Nome
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] outline-none"
                  />
                </label>
                <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                  Telefone
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] outline-none"
                  />
                </label>
                <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                  E-mail
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] outline-none"
                  />
                </label>
                <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                  Valor (R$)
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] outline-none"
                  />
                </label>
                <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                  Origem
                  <select
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value as CrmCardOrigin)}
                    className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] outline-none"
                  >
                    {CRM_CARD_ORIGINS.map((o) => (
                      <option key={o} value={o}>
                        {CRM_ORIGIN_LABEL[o]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                  Status
                  <select
                    value={statusId}
                    onChange={(e) => setStatusId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] outline-none"
                  >
                    {statuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                  Responsável
                  <select
                    value={responsavelId}
                    onChange={(e) => setResponsavelId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] outline-none"
                  >
                    <option value="">Sem responsável</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] sm:col-span-2">
                  Funil
                  <select
                    value={funilId}
                    onChange={(e) => setFunilId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] outline-none"
                  >
                    {funis.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
                </div>
              </section>

              <section className="mt-6 border-t border-[var(--border-color)] pt-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                    Touchpoints
                  </h3>
                  <span className="text-xs font-medium text-[var(--text-muted)]">
                    {doneCount} de 7 concluídos
                  </span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-[var(--border-color)]">
                  <table className="min-w-full text-xs">
                    <thead className="bg-[var(--input-bg)] text-[var(--text-muted)]">
                      <tr>
                        <th className="px-2 py-2 text-left font-semibold">TP</th>
                        <th className="px-2 py-2 text-left font-semibold">Feito</th>
                        <th className="px-2 py-2 text-left font-semibold">Data</th>
                        <th className="px-2 py-2 text-left font-semibold">Canal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {touchpoints.map((tp) => (
                        <tr key={tp.number} className="border-t border-[var(--border-color)]">
                          <td className="px-2 py-2 font-bold text-[var(--text-primary)]">
                            TP{tp.number}
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={tp.done}
                              onChange={(e) =>
                                updateTouchpoint(tp.number, { done: e.target.checked })
                              }
                              className="h-4 w-4 rounded"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="date"
                              value={tp.date ?? ''}
                              onChange={(e) =>
                                updateTouchpoint(tp.number, {
                                  date: e.target.value || null,
                                })
                              }
                              className="w-full min-w-[8rem] rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 font-medium text-[var(--text-primary)] outline-none"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <select
                              value={tp.channel ?? ''}
                              onChange={(e) =>
                                updateTouchpoint(tp.number, {
                                  channel: e.target.value || null,
                                })
                              }
                              className="w-full min-w-[7rem] rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 font-medium text-[var(--text-primary)] outline-none"
                            >
                              <option value="">—</option>
                              {channels.map((channel) => (
                                <option key={channel.id} value={channel.id}>
                                  {channel.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="mt-6 border-t border-[var(--border-color)] pt-5">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                  Atividades
                </h3>
                <CrmActivityTimeline items={activityItems} />
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={quickNote}
                    onChange={(e) => setQuickNote(e.target.value)}
                    placeholder="Adicionar nota rápida (sem touchpoint formal)…"
                    className="flex-1 rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void addQuickNote();
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={saving || !quickNote.trim()}
                    onClick={() => void addQuickNote()}
                    className="rounded-xl border border-[var(--border-color)] px-3 py-2.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--input-bg)] disabled:opacity-50"
                  >
                    Adicionar nota
                  </button>
                </div>
              </section>

              <section className="mt-6 border-t border-[var(--border-color)] pt-5">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                  Observações
                </h3>
                <div className="grid grid-cols-1 gap-3">
                <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                  Observações
                  <textarea
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    rows={3}
                    className="mt-1.5 w-full resize-none rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] outline-none"
                  />
                </label>
                <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                  Log WhatsApp
                  <textarea
                    value={whatsappLog}
                    onChange={(e) => setWhatsappLog(e.target.value)}
                    rows={4}
                    placeholder="Cole aqui a conversa do WhatsApp…"
                    className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 font-mono text-xs font-medium text-[var(--text-primary)] outline-none"
                  />
                </label>
                </div>
              </section>

              {error ? <p className="mt-4 text-sm text-rose-400">{error}</p> : null}

              <div className="mt-6 flex flex-wrap gap-2 border-t border-[var(--border-color)] pt-5">
                <GlowButton variant="primary" disabled={saving} onClick={() => void save()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                </GlowButton>
                <GlowButton
                  variant="secondary"
                  disabled={saving || selectedStatus?.name === 'Fechado'}
                  onClick={() => void markStatus('Fechado')}
                >
                  Marcar Fechado
                </GlowButton>
                <GlowButton
                  variant="secondary"
                  disabled={saving || selectedStatus?.name === 'Perdido'}
                  onClick={() => void markStatus('Perdido')}
                >
                  Marcar Perdido
                </GlowButton>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleDelete()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-400/30 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </button>
                {card.value ? (
                  <span className="ml-auto self-center text-sm text-[var(--text-secondary)]">
                    Valor: {formatCrmCurrency(card.value)}
                  </span>
                ) : null}
              </div>
            </>
          )}
        </GlassCard>
      </div>
      <CrmLossReasonModal
        open={lossModalOpen}
        onClose={() => setLossModalOpen(false)}
        onConfirm={confirmLoss}
        saving={saving}
      />
    </div>
  );
}
