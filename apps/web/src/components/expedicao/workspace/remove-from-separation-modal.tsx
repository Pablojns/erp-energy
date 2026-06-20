'use client';

export function RemoveFromSeparationModal(props: {
  count: number;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { count, loading, onCancel, onConfirm } = props;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          Remover da separação
        </h3>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Você está removendo {count} pedido{count === 1 ? '' : 's'} da separação. Confirmar?
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]"
            onClick={onCancel}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Removendo…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
