'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { GlowButton } from '@/src/components/shell/glow-button';
import { GlassCard } from '@/src/components/shell/glass-card';
import { PremiumSelect } from '@/src/components/ui/premium-select';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

type ReserveProduct = {
  id: string;
  sku: string;
  name: string;
};

type CadastroOption = {
  id: string;
  name: string;
  isActive: boolean;
};

export function EstoqueReserveModal(props: {
  open: boolean;
  product: ReserveProduct | null;
  onClose: () => void;
  onSuccess: (message: string) => void | Promise<void>;
}) {
  const { open, product, onClose, onSuccess } = props;

  const [reserveStep, setReserveStep] = useState<'form' | 'confirm'>('form');
  const [receivers, setReceivers] = useState<CadastroOption[]>([]);
  const [reserveForm, setReserveForm] = useState({
    receiverId: '',
    quantity: '',
    notes: '',
  });
  const [reserveSaving, setReserveSaving] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !product) return;
    setReserveError(null);
    setReserveStep('form');
    setReserveForm({ receiverId: '', quantity: '', notes: '' });
    let active = true;
    void erpFetchJson<CadastroOption[]>('cadastros/receivers')
      .then((rows) => {
        if (active) setReceivers(rows.filter((r) => r.isActive));
      })
      .catch(() => {
        if (active) setReceivers([]);
      });
    return () => {
      active = false;
    };
  }, [open, product?.id]);

  if (!open || !product) return null;

  const handleClose = () => {
    if (reserveSaving) return;
    onClose();
  };

  const requestReserveConfirm = () => {
    setReserveError(null);
    if (!reserveForm.receiverId.trim()) {
      setReserveError('Selecione o recebedor.');
      return;
    }
    const qty = Number.parseInt(reserveForm.quantity.trim(), 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      setReserveError('Informe uma quantidade válida.');
      return;
    }
    setReserveStep('confirm');
  };

  const executeReserveSave = async () => {
    const receiver = receivers.find((r) => r.id === reserveForm.receiverId);
    if (!receiver) {
      setReserveError('Recebedor inválido.');
      setReserveStep('form');
      return;
    }
    const qty = Number.parseInt(reserveForm.quantity.trim(), 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      setReserveError('Informe uma quantidade válida.');
      setReserveStep('form');
      return;
    }

    setReserveSaving(true);
    setReserveError(null);
    try {
      const notesParts = [
        `Reserva para ${receiver.name}`,
        reserveForm.notes.trim(),
      ].filter(Boolean);

      await erpFetchJson('stock/movements', {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          movementType: 'RESERVE',
          quantity: qty,
          reference: receiver.name,
          notes: notesParts.join(' — '),
        }),
      });
      onClose();
      await onSuccess('Reserva registrada com sucesso.');
    } catch (e) {
      setReserveError(
        e instanceof Error ? e.message : 'Falha ao registrar reserva.',
      );
      setReserveStep('form');
    } finally {
      setReserveSaving(false);
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
    >
      <div
        className="h-auto w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <GlassCard className="border-gray-200 p-3 shadow-2xl sm:p-6">
          {reserveStep === 'form' ? (
            <>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Reservar estoque
              </h2>
              <div className="mt-3 rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5">
                <p className="text-xs text-[var(--text-secondary)]">Produto</p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {product.name}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  SKU {product.sku}
                </p>
              </div>
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Recebedor *
                  <div className="mt-1.5">
                    <PremiumSelect
                      value={reserveForm.receiverId}
                      onChange={(receiverId) =>
                        setReserveForm((f) => ({ ...f, receiverId }))
                      }
                      options={receivers.map((r) => ({
                        value: r.id,
                        label: r.name,
                      }))}
                      placeholder="Selecione o recebedor…"
                    />
                  </div>
                </label>
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Quantidade *
                  <input
                    type="number"
                    min={1}
                    value={reserveForm.quantity}
                    onChange={(e) =>
                      setReserveForm((f) => ({
                        ...f,
                        quantity: e.target.value,
                      }))
                    }
                    className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-base text-[var(--text-primary)] outline-none"
                  />
                </label>
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Observação (opcional)
                  <textarea
                    value={reserveForm.notes}
                    onChange={(e) =>
                      setReserveForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    rows={2}
                    className="mt-1.5 w-full resize-none rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-base text-[var(--text-primary)] outline-none"
                  />
                </label>
              </div>
              {reserveError ? (
                <p className="mt-3 text-sm text-rose-500">{reserveError}</p>
              ) : null}
              <div className="mt-6 flex justify-end gap-2">
                <GlowButton variant="secondary" onClick={handleClose}>
                  Cancelar
                </GlowButton>
                <GlowButton variant="primary" onClick={requestReserveConfirm}>
                  Continuar
                </GlowButton>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Confirmar reserva
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                Você está reservando{' '}
                <span className="font-semibold text-[var(--text-primary)]">
                  {reserveForm.quantity.trim()}
                </span>{' '}
                unidade(s) de{' '}
                <span className="font-semibold text-[var(--text-primary)]">
                  {product.name}
                </span>{' '}
                para{' '}
                <span className="font-semibold text-[var(--text-primary)]">
                  {receivers.find((r) => r.id === reserveForm.receiverId)?.name ??
                    '—'}
                </span>
                . Confirmar?
              </p>
              {reserveError ? (
                <p className="mt-3 text-sm text-rose-500">{reserveError}</p>
              ) : null}
              <div className="mt-6 flex justify-end gap-2">
                <GlowButton
                  variant="secondary"
                  disabled={reserveSaving}
                  onClick={() => setReserveStep('form')}
                >
                  Voltar
                </GlowButton>
                <GlowButton
                  variant="primary"
                  disabled={reserveSaving}
                  onClick={() => void executeReserveSave()}
                >
                  {reserveSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando
                    </>
                  ) : (
                    'Confirmar'
                  )}
                </GlowButton>
              </div>
            </>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
