'use client';

import { Loader2, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { DespesaCategoria } from '@/src/components/financeiro/types';
import { DESPESA_CATEGORIAS } from '@/src/components/financeiro/types';
import { formatYmd } from '@/src/components/financeiro/utils';

function ModalShell(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const { title, onClose, children, wide } = props;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        className={`fin-card w-full overflow-hidden rounded-2xl shadow-2xl ${wide ? 'max-w-2xl' : 'max-w-md'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fin-modal-title"
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--fin-border)' }}
        >
          <h3
            id="fin-modal-title"
            className="text-sm font-semibold text-[var(--fin-text)]"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--fin-text-muted)] transition hover:bg-[var(--fin-card-muted)] hover:text-[var(--fin-text)]"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputClass =
  'fin-input mt-1.5 w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--fin-accent-soft)]';

export function PagarNfModal(props: {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: (dataPagamento: string) => void;
}) {
  const { open, loading, onClose, onConfirm } = props;
  const [dataPagamento, setDataPagamento] = useState(formatYmd(new Date()));

  useEffect(() => {
    if (open) setDataPagamento(formatYmd(new Date()));
  }, [open]);

  if (!open) return null;

  return (
    <ModalShell title="Marcar como pago" onClose={onClose}>
      <div className="space-y-4 p-4">
        <label className="block text-xs text-[var(--fin-text-secondary)]">
          Data do pagamento
          <input
            type="date"
            value={dataPagamento}
            onChange={(e) => setDataPagamento(e.target.value)}
            className={inputClass}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-3 py-1.5 text-xs text-[var(--fin-text-secondary)]"
            style={{ borderColor: 'var(--fin-border)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading || !dataPagamento}
            onClick={() => onConfirm(dataPagamento)}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--fin-accent)' }}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Confirmar
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export function CobrarNfModal(props: {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: (observacao: string) => void;
}) {
  const { open, loading, onClose, onConfirm } = props;
  const [observacao, setObservacao] = useState('');

  useEffect(() => {
    if (open) setObservacao('');
  }, [open]);

  if (!open) return null;

  return (
    <ModalShell title="Registrar cobrança" onClose={onClose}>
      <div className="space-y-4 p-4">
        <label className="block text-xs text-[var(--fin-text-secondary)]">
          Observação
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={3}
            placeholder="Ex.: Cliente informou pagamento na sexta-feira..."
            className={inputClass}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-3 py-1.5 text-xs text-[var(--fin-text-secondary)]"
            style={{ borderColor: 'var(--fin-border)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading || !observacao.trim()}
            onClick={() => onConfirm(observacao.trim())}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--fin-accent)' }}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Salvar
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export function NovaDespesaModal(props: {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    descricao: string;
    categoria: DespesaCategoria;
    valor: string;
    data: string;
    fornecedor?: string;
    observacao?: string;
  }) => void;
}) {
  const { open, loading, onClose, onConfirm } = props;
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState<DespesaCategoria>('OPERACIONAL');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(formatYmd(new Date()));
  const [fornecedor, setFornecedor] = useState('');
  const [observacao, setObservacao] = useState('');

  useEffect(() => {
    if (!open) return;
    setDescricao('');
    setCategoria('OPERACIONAL');
    setValor('');
    setData(formatYmd(new Date()));
    setFornecedor('');
    setObservacao('');
  }, [open]);

  if (!open) return null;

  return (
    <ModalShell title="Nova despesa" onClose={onClose}>
      <div className="erp-scrollbar max-h-[70vh] space-y-3 overflow-y-auto p-4">
        <label className="block text-xs text-[var(--fin-text-secondary)]">
          Descrição
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-xs text-[var(--fin-text-secondary)]">
          Categoria
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as DespesaCategoria)}
            className={inputClass}
          >
            {DESPESA_CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs text-[var(--fin-text-secondary)]">
            Valor (R$)
            <input
              type="text"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              className={inputClass}
            />
          </label>
          <label className="block text-xs text-[var(--fin-text-secondary)]">
            Data
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <label className="block text-xs text-[var(--fin-text-secondary)]">
          Fornecedor (opcional)
          <input
            value={fornecedor}
            onChange={(e) => setFornecedor(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-xs text-[var(--fin-text-secondary)]">
          Observação (opcional)
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            className={inputClass}
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-3 py-1.5 text-xs text-[var(--fin-text-secondary)]"
            style={{ borderColor: 'var(--fin-border)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading || !descricao.trim() || !valor.trim() || !data}
            onClick={() =>
              onConfirm({
                descricao: descricao.trim(),
                categoria,
                valor: valor.trim(),
                data,
                fornecedor: fornecedor.trim() || undefined,
                observacao: observacao.trim() || undefined,
              })
            }
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--fin-accent)' }}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Criar despesa
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export function CaPreviewModal(props: {
  open: boolean;
  title: string;
  loading: boolean;
  applying: boolean;
  error: string | null;
  applied: boolean;
  appliedMessage: string | null;
  loadingMessage?: string | null;
  applyLabel?: string;
  onClose: () => void;
  onApply: () => void;
  children: ReactNode;
}) {
  const {
    open,
    title,
    loading,
    applying,
    error,
    applied,
    appliedMessage,
    loadingMessage,
    applyLabel,
    onClose,
    onApply,
    children,
  } = props;
  if (!open) return null;

  return (
    <ModalShell title={title} onClose={onClose} wide>
      <div className="erp-scrollbar max-h-[70vh] space-y-4 overflow-y-auto p-4">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-[var(--fin-text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            {loadingMessage ??
              'Consultando a Conta Azul (preview, sem alterar dados)...'}
          </p>
        ) : null}
        {!loading && applying && loadingMessage ? (
          <p className="flex items-center gap-2 text-sm text-[var(--fin-text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            {loadingMessage}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-[var(--fin-danger)]" role="alert">
            {error}
          </p>
        ) : null}
        {!loading && !error ? children : null}
        {applied && appliedMessage ? (
          <p className="text-sm font-medium text-[var(--fin-success)]">
            {appliedMessage}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-3 py-1.5 text-xs text-[var(--fin-text-secondary)]"
            style={{ borderColor: 'var(--fin-border)' }}
          >
            {applied ? 'Fechar' : 'Cancelar'}
          </button>
          {!applied && !loading && !error ? (
            <button
              type="button"
              disabled={applying}
              onClick={onApply}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--fin-accent)' }}
            >
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {applyLabel ?? 'Aplicar'}
            </button>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}
