'use client';

import { Search } from 'lucide-react';

export function ExpeditionSearch(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const {
    value,
    onChange,
    placeholder = 'Buscar: pedido, cliente, CNPJ, recebedor, ponto, SKU, item, NF, código WEG…',
  } = props;

  return (
    <div className="erp-search-block relative w-full">
      <Search
        className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-erp-fg-muted transition-colors"
        aria-hidden
      />
      <input
        type="search"
        autoComplete="off"
        aria-label="Busca global nos pedidos"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="erp-search-hero erp-search-hero--lg h-14 w-full rounded-2xl py-3 pl-12 pr-4 text-[15px] outline-none transition-all duration-300"
      />
      <p className="mt-2 text-[11px] text-erp-fg-subtle">
        Busca instantânea com debounce — código, ME, cliente, SKU e observações.
      </p>
    </div>
  );
}
