'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { GlowButton } from '@/src/components/shell/glow-button';
import { GlassCard } from '@/src/components/shell/glass-card';
import {
  CRM_CARD_ORIGINS,
  CRM_ORIGIN_LABEL,
  checkCrmDuplicate,
  createCrmCard,
  type CrmCardDto,
  type CrmCardOrigin,
  type CrmFunilDto,
} from '@/src/services/api/crm-api';

export function CrmCreateCardModal(props: {
  open: boolean;
  funis: CrmFunilDto[];
  defaultFunilId?: string;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  onViewExisting?: (card: CrmCardDto) => void;
}) {
  const { open, funis, defaultFunilId, onClose, onCreated, onViewExisting } = props;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [value, setValue] = useState('');
  const [origin, setOrigin] = useState<CrmCardOrigin>('FRIO');
  const [funilId, setFunilId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<CrmCardDto | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setPhone('');
    setEmail('');
    setValue('');
    setOrigin('FRIO');
    setFunilId(defaultFunilId ?? funis[0]?.id ?? '');
    setError(null);
    setDuplicate(null);
  }, [defaultFunilId, funis, open]);

  if (!open) return null;

  const createLead = async (force = false) => {
    const nm = name.trim();
    const parsedValue = value.trim() ? Number(value.replace(',', '.')) : null;
    await createCrmCard({
      name: nm,
      phone: phone.trim() || null,
      email: email.trim() || null,
      value: parsedValue != null && Number.isFinite(parsedValue) ? parsedValue : null,
      origin,
      funilId,
      force,
    });
    await onCreated();
    onClose();
  };

  const handleSave = async () => {
    const nm = name.trim();
    if (!nm) {
      setError('Informe o nome do lead.');
      return;
    }
    if (!funilId) {
      setError('Selecione um funil.');
      return;
    }
    const phoneTrim = phone.trim();
    const emailTrim = email.trim();
    if (!phoneTrim && !emailTrim) {
      setSaving(true);
      setError(null);
      try {
        await createLead(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao criar lead.');
      } finally {
        setSaving(false);
      }
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const check = await checkCrmDuplicate({
        phone: phoneTrim || undefined,
        email: emailTrim || undefined,
      });
      if (check.duplicate && check.existing) {
        setDuplicate(check.existing);
        return;
      }
      await createLead(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar lead.');
    } finally {
      setSaving(false);
    }
  };

  const handleContinueDespiteDuplicate = async () => {
    setSaving(true);
    setError(null);
    try {
      await createLead(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar lead.');
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
        <GlassCard className="border-gray-200 p-4 shadow-2xl sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Novo lead</h2>
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
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                Telefone
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none"
                />
              </label>
              <label className="block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                E-mail
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                Valor (R$)
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none"
                />
              </label>
              <label className="block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                Origem
                <select
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value as CrmCardOrigin)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none"
                >
                  {CRM_CARD_ORIGINS.map((o) => (
                    <option key={o} value={o}>
                      {CRM_ORIGIN_LABEL[o]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Funil
              <select
                value={funilId}
                onChange={(e) => setFunilId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none"
              >
                {funis.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            {duplicate ? (
              <div className="rounded-xl border border-amber-200 bg-amber-100 px-3 py-3 text-sm text-amber-800">
                <p>
                  Lead similar encontrado:{' '}
                  <span className="font-semibold">{duplicate.name}</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <GlowButton
                    variant="secondary"
                    disabled={saving}
                    onClick={() => {
                      onViewExisting?.(duplicate);
                      onClose();
                    }}
                  >
                    Ver existente
                  </GlowButton>
                  <GlowButton
                    variant="primary"
                    disabled={saving}
                    onClick={() => void handleContinueDespiteDuplicate()}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Continuar criando'
                    )}
                  </GlowButton>
                </div>
              </div>
            ) : null}
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
                'Criar lead'
              )}
            </GlowButton>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
