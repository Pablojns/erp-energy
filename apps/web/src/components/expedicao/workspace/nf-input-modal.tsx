'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export function NfInputModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (nfNumber: string) => Promise<void>;
  pedidoNumero: string;
}) {
  const { isOpen, onClose, onConfirm, pedidoNumero } = props;
  const [nfNumber, setNfNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setNfNumber('');
    setError('');
    setIsLoading(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    const cleanNumber = nfNumber.replace(/\D/g, '');

    if (!cleanNumber || cleanNumber.length < 1 || cleanNumber.length > 9) {
      setError('Informe 1 a 9 dígitos');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      await onConfirm(cleanNumber);
    } catch {
      setError('Erro ao salvar NF-e. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Fechar modal"
        onClick={onClose}
        disabled={isLoading}
      />

      <div
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl"
        role="dialog"
        aria-labelledby="nf-input-title"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            id="nf-input-title"
            className="text-lg font-semibold text-[var(--text-primary)]"
          >
            Inserir NF-e
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-md p-1 text-[var(--text-secondary)] transition hover:bg-[var(--input-bg)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-5">
          <p className="mb-4 text-sm text-[var(--text-secondary)]">
            Pedido:{' '}
            <span className="font-semibold text-[var(--text-primary)]">
              {pedidoNumero}
            </span>
          </p>

          <label
            htmlFor="nfNumber"
            className="mb-2 block text-sm font-medium text-[var(--text-primary)]"
          >
            Número da Nota Fiscal
          </label>

          <input
            id="nfNumber"
            type="text"
            inputMode="numeric"
            value={nfNumber}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 9);
              setNfNumber(value);
              setError('');
            }}
            placeholder="Ex: 1234"
            autoFocus
            className={`h-12 w-full rounded-lg border px-4 font-mono text-lg tracking-wider outline-none transition focus:ring-2 focus:ring-[var(--accent)] ${
              error
                ? 'border-red-500 bg-red-500/10'
                : 'border-[var(--border-color)] bg-[var(--input-bg)] text-[var(--text-primary)]'
            }`}
          />

          {error ? (
            <p className="mt-2 text-sm text-red-500">{error}</p>
          ) : null}

          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Digite o número completo da NF-e (1 a 9 dígitos).
          </p>
        </div>

        <div className="flex gap-3 border-t border-[var(--border-color)] bg-[var(--input-bg)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 rounded-lg border border-[var(--border-color)] px-4 py-2.5 font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-card)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isLoading || !nfNumber}
            className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2.5 font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Salvando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
