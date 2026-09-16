'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

export type CatalogSearchHit = {
  kind: 'weg' | 'quote' | 'external' | 'create';
  id?: string;
  name: string;
  sku?: string;
  price?: string;
  supplier?: string;
  source?: string;
  stockQty?: number;
};

type CatalogSearchResponse = {
  weg: Array<{ id: string; sku: string; name: string; price: string }>;
  quote: Array<{
    id: string;
    sku: string;
    name: string;
    price: string;
    supplier: string;
  }>;
  external: Array<{
    id: string;
    name: string;
    lastKnownPrice: string;
    source: string;
    stockQty?: number;
  }>;
};

function money(value: string | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function ExternalItemSearchField(props: {
  value: string;
  onChange: (value: string) => void;
  onPick: (hit: CatalogSearchHit) => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
}) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<CatalogSearchHit[]>([]);
  const search = props.value.trim();

  useEffect(() => {
    if (search.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setLoading(true);
      void erpFetchJson<CatalogSearchResponse>(
        `api/external-items/catalog-search?search=${encodeURIComponent(search)}`,
      )
        .then((res) => {
          if (cancelled) return;
          const next: CatalogSearchHit[] = [
            ...(res.weg ?? []).map((row) => ({
              kind: 'weg' as const,
              id: row.id,
              name: row.name,
              sku: row.sku,
              price: row.price,
            })),
            ...(res.quote ?? []).map((row) => ({
              kind: 'quote' as const,
              id: row.id,
              name: row.name,
              sku: row.sku,
              price: row.price,
              supplier: row.supplier,
            })),
            ...(res.external ?? []).map((row) => ({
              kind: 'external' as const,
              id: row.id,
              name: row.name,
              price: row.lastKnownPrice,
              source: row.source,
              stockQty: row.stockQty,
            })),
          ];
          const hasExactExternal = next.some(
            (row) =>
              row.kind === 'external' &&
              row.name.trim().toLowerCase() === search.toLowerCase(),
          );
          if (!hasExactExternal) {
            next.push({ kind: 'create', name: search });
          }
          setHits(next);
          setOpen(true);
        })
        .catch(() => {
          if (!cancelled) setHits([{ kind: 'create', name: search }]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [search]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const labelFor = (hit: CatalogSearchHit) => {
    if (hit.kind === 'create') return `Criar item externo: ${hit.name}`;
    if (hit.kind === 'weg') return `WEG · ${hit.name}${hit.sku ? ` (${hit.sku})` : ''}`;
    if (hit.kind === 'quote') {
      return `${hit.supplier || 'XBZ/SPOT'} · ${hit.name}`;
    }
    return `Item externo · ${hit.name}`;
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={props.value}
        onChange={(e) => {
          props.onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (hits.length > 0) setOpen(true);
        }}
        placeholder={props.placeholder ?? 'Buscar WEG, XBZ/SPOT ou item externo'}
        className={`w-full rounded-lg border px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)] ${
          props.invalid
            ? 'border-rose-500/70 bg-rose-500/[0.06]'
            : 'border-[var(--border-color)] bg-[var(--input-bg)]'
        }`}
        disabled={props.disabled}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
      />
      {loading ? (
        <Loader2 className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 animate-spin text-[var(--text-secondary)]" />
      ) : null}
      {open && hits.length > 0 ? (
        <ul
          id={listId}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] py-1 shadow-lg"
        >
          {hits.map((hit) => (
            <li key={`${hit.kind}-${hit.id ?? hit.name}`}>
              <button
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-[var(--input-bg)]"
                onClick={() => {
                  props.onPick(hit);
                  setOpen(false);
                }}
              >
                <span className="font-medium text-[var(--text-primary)]">
                  {labelFor(hit)}
                </span>
                {hit.kind !== 'create' && hit.price ? (
                  <span className="text-xs text-[var(--text-secondary)]">
                    Sugestão: {money(hit.price)} — preço do pedido continua editável
                    {hit.kind === 'external' && hit.stockQty != null
                      ? ` · estoque ${hit.stockQty}`
                      : ''}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
