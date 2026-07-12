'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Package, Search, Truck, Users, X } from 'lucide-react';
import { ListSkeleton } from '@/src/components/ui/skeleton';
import {
  searchGlobal,
  type GlobalSearchResponse,
  type SearchResultItem,
} from '@/src/services/api/search-api';

const EMPTY_RESULTS: GlobalSearchResponse = {
  orders: [],
  products: [],
  customers: [],
};

type GlobalSearchModalProps = {
  open: boolean;
  onClose: () => void;
};

export function GlobalSearchModal({ open, onClose }: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GlobalSearchResponse>(EMPTY_RESULTS);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(EMPTY_RESULTS);
      setError(null);
      setLoading(false);
      abortRef.current?.abort();
      return;
    }

    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    const q = query.trim();
    if (q.length < 2) {
      abortRef.current?.abort();
      setLoading(false);
      setError(null);
      setResults(EMPTY_RESULTS);
      return;
    }

    const timer = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);

      void searchGlobal(q, controller.signal)
        .then((payload) => {
          if (controller.signal.aborted) return;
          setResults(payload);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : 'Falha na busca.');
          setResults(EMPTY_RESULTS);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    }, 280);

    return () => window.clearTimeout(timer);
  }, [open, query]);

  if (!open) return null;

  const hasResults =
    results.orders.length + results.products.length + results.customers.length > 0;
  const showHint = query.trim().length < 2 && !loading;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/55 p-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="erp-module-panel w-full max-w-2xl overflow-hidden shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
      >
        <div className="flex items-center gap-2 border-b border-[var(--erp-border)] px-4 py-3">
          <Search className="h-5 w-5 shrink-0 text-[var(--erp-fg-muted)]" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar pedidos, produtos ou clientes…"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--erp-fg)] outline-none placeholder:text-[var(--erp-fg-muted)]"
          />
          <kbd className="hidden rounded border border-[var(--erp-border)] px-1.5 py-0.5 text-[10px] text-[var(--erp-fg-muted)] sm:inline">
            Esc
          </kbd>
          <button
            type="button"
            onClick={onClose}
            className="erp-focus-ring rounded-lg p-1.5 text-[var(--erp-fg-muted)] transition hover:bg-white/5 hover:text-[var(--erp-fg)]"
            aria-label="Fechar busca"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
          {showHint ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--erp-fg-muted)]">
              Digite ao menos 2 caracteres para buscar em pedidos, produtos e clientes.
            </p>
          ) : null}

          {loading ? (
            <div className="p-3">
              <ListSkeleton rows={5} />
            </div>
          ) : null}

          {error ? (
            <p className="px-3 py-6 text-center text-sm text-rose-400">{error}</p>
          ) : null}

          {!loading && !error && query.trim().length >= 2 && !hasResults ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--erp-fg-muted)]">
              Nenhum resultado para &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : null}

          {!loading && !error && hasResults ? (
            <div className="space-y-3 p-1">
              <ResultGroup
                title="Pedidos"
                icon={Truck}
                items={results.orders}
                onNavigate={onClose}
              />
              <ResultGroup
                title="Produtos"
                icon={Package}
                items={results.products}
                onNavigate={onClose}
              />
              <ResultGroup
                title="Clientes"
                icon={Users}
                items={results.customers}
                onNavigate={onClose}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ResultGroup(props: {
  title: string;
  icon: typeof Truck;
  items: SearchResultItem[];
  onNavigate: () => void;
}) {
  if (props.items.length === 0) return null;
  const Icon = props.icon;

  return (
    <section>
      <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--erp-fg-muted)]">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {props.title}
      </div>
      <ul className="space-y-1">
        {props.items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              onClick={props.onNavigate}
              className="erp-focus-ring flex items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/[0.04]"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--erp-border)] bg-[var(--erp-bg-muted)]">
                <Icon className="h-4 w-4 text-[var(--erp-accent)]" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-[var(--erp-fg)]">
                  {item.title}
                </span>
                <span className="block truncate text-xs text-[var(--erp-fg-muted)]">
                  {item.subtitle}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
