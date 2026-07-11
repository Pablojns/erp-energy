'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  CRM_CARD_ORIGINS,
  CRM_ORIGIN_BADGE_CLASS,
  CRM_ORIGIN_LABEL,
  formatCrmCurrency,
  type CrmCardDto,
  type CrmCardOrigin,
  type CrmFunilDto,
} from '@/src/services/api/crm-api';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR');
}

export function CrmClientesList(props: {
  cards: CrmCardDto[];
  funis: CrmFunilDto[];
  loading: boolean;
  onOpenCard: (card: CrmCardDto) => void;
}) {
  const [search, setSearch] = useState('');
  const [originFilter, setOriginFilter] = useState<CrmCardOrigin | 'TODOS'>('TODOS');

  const funilNameById = useMemo(() => {
    return Object.fromEntries(props.funis.map((f) => [f.id, f.name]));
  }, [props.funis]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return props.cards.filter((card) => {
      if (originFilter !== 'TODOS' && card.origin !== originFilter) return false;
      if (!q) return true;
      const funilName = card.funil?.name ?? funilNameById[card.funilId] ?? '';
      const haystack = [card.name, card.phone, card.email, funilName, card.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [funilNameById, originFilter, props.cards, search]);

  return (
    <section className="erp-module-panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--erp-border)] p-3">
        <div className="relative min-w-[min(100%,14rem)] flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-fg-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone, e-mail..."
            className="erp-module-input pl-9"
          />
        </div>
        <select
          value={originFilter}
          onChange={(e) => setOriginFilter(e.target.value as CrmCardOrigin | 'TODOS')}
          className="erp-module-input w-auto min-w-[9rem]"
        >
          <option value="TODOS">Todas origens</option>
          {CRM_CARD_ORIGINS.map((origin) => (
            <option key={origin} value={origin}>
              {CRM_ORIGIN_LABEL[origin]}
            </option>
          ))}
        </select>
        <span className="text-xs text-[var(--erp-fg-muted)]">
          {filtered.length} {filtered.length === 1 ? 'lead' : 'leads'}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {props.loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-12 animate-pulse rounded-lg border border-[var(--erp-border)] bg-[var(--erp-bg-muted)]"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[12rem] items-center justify-center p-6 text-sm text-[var(--erp-fg-muted)]">
            Nenhum lead encontrado.
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--erp-bg-elevated)]">
              <tr className="border-b border-[var(--erp-border)] text-left text-xs uppercase tracking-wide text-[var(--erp-fg-muted)]">
                <th className="px-4 py-3 font-semibold">Nome</th>
                <th className="px-4 py-3 font-semibold">Contato</th>
                <th className="px-4 py-3 font-semibold">Origem</th>
                <th className="px-4 py-3 font-semibold">Funil</th>
                <th className="px-4 py-3 font-semibold">Valor</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Touch.</th>
                <th className="px-4 py-3 font-semibold">Criado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((card) => {
                const funilName =
                  card.funil?.name ?? funilNameById[card.funilId] ?? '—';
                return (
                  <tr
                    key={card.id}
                    onClick={() => props.onOpenCard(card)}
                    className="cursor-pointer border-b border-[var(--erp-border)] transition hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--erp-fg)]">
                      {card.name}
                    </td>
                    <td className="px-4 py-3 text-[var(--erp-fg-secondary)]">
                      <div className="max-w-[12rem] truncate">{card.phone ?? '—'}</div>
                      {card.email ? (
                        <div className="max-w-[12rem] truncate text-xs text-[var(--erp-fg-muted)]">
                          {card.email}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${CRM_ORIGIN_BADGE_CLASS[card.origin]}`}
                      >
                        {CRM_ORIGIN_LABEL[card.origin]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--erp-fg-secondary)]">{funilName}</td>
                    <td className="px-4 py-3 text-[var(--erp-fg)]">
                      {card.value ? formatCrmCurrency(card.value) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {card.statusMeta ? (
                        <span
                          className="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                          style={{
                            borderColor: `${card.statusMeta.color}66`,
                            backgroundColor: `${card.statusMeta.color}22`,
                            color: card.statusMeta.color,
                          }}
                        >
                          {card.statusMeta.name}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--erp-fg-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--erp-fg-secondary)]">
                      {card.touchPoints}
                    </td>
                    <td className="px-4 py-3 text-[var(--erp-fg-muted)]">
                      {formatDate(card.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
