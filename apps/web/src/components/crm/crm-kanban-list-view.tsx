'use client';

import { useMemo, useState } from 'react';
import { ListSkeleton } from '@/src/components/ui/skeleton';
import { CrmLeadScoreThermometer } from '@/src/components/crm/crm-lead-score';
import {
  CRM_ORIGIN_BADGE_CLASS,
  CRM_ORIGIN_LABEL,
  formatCrmCurrency,
  type CrmCardDto,
  type CrmFunilDto,
  type CrmStatusDto,
  type CrmUserDto,
} from '@/src/services/api/crm-api';

type SortKey =
  | 'name'
  | 'origin'
  | 'status'
  | 'funil'
  | 'value'
  | 'touchPoints'
  | 'score'
  | 'responsavel'
  | 'lastActivity';

type SortDir = 'asc' | 'desc';

function formatActivity(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CrmKanbanListView(props: {
  cards: CrmCardDto[];
  funis: CrmFunilDto[];
  statuses: CrmStatusDto[];
  users: CrmUserDto[];
  loading: boolean;
  onOpenCard: (card: CrmCardDto) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const funilNameById = useMemo(
    () => Object.fromEntries(props.funis.map((f) => [f.id, f.name])),
    [props.funis],
  );

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const rows = [...props.cards];
    rows.sort((a, b) => {
      const compareString = (left: string, right: string) =>
        left.localeCompare(right, 'pt-BR') * dir;
      const compareNumber = (left: number, right: number) => (left - right) * dir;

      switch (sortKey) {
        case 'name':
          return compareString(a.name, b.name);
        case 'origin':
          return compareString(a.origin, b.origin);
        case 'status':
          return compareString(
            a.statusMeta?.name ?? a.status,
            b.statusMeta?.name ?? b.status,
          );
        case 'funil':
          return compareString(
            a.funil?.name ?? funilNameById[a.funilId] ?? '',
            b.funil?.name ?? funilNameById[b.funilId] ?? '',
          );
        case 'value':
          return compareNumber(Number(a.value ?? 0), Number(b.value ?? 0));
        case 'touchPoints':
          return compareNumber(a.touchPoints, b.touchPoints);
        case 'score':
          return compareNumber(a.score ?? 0, b.score ?? 0);
        case 'responsavel':
          return compareString(a.responsavel?.name ?? '', b.responsavel?.name ?? '');
        case 'lastActivity':
          return compareString(
            a.lastTouchpointAt ?? a.updatedAt,
            b.lastTouchpointAt ?? b.updatedAt,
          );
        default:
          return 0;
      }
    });
    return rows;
  }, [funilNameById, props.cards, sortDir, sortKey]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  const indicator = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  const columns: Array<{ key: SortKey; label: string }> = [
    { key: 'name', label: 'Nome' },
    { key: 'origin', label: 'Origem' },
    { key: 'status', label: 'Status' },
    { key: 'funil', label: 'Funil' },
    { key: 'value', label: 'Valor' },
    { key: 'touchPoints', label: 'Touchpoints' },
    { key: 'score', label: 'Score' },
    { key: 'responsavel', label: 'Responsável' },
    { key: 'lastActivity', label: 'Última atividade' },
  ];

  if (props.loading) {
    return (
      <div className="p-3">
        <ListSkeleton rows={8} />
      </div>
    );
  }

  return (
    <div className="lista-container overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 z-10 bg-[var(--erp-bg-elevated)]">
          <tr className="border-b border-[var(--erp-border)] text-left text-xs uppercase tracking-wide text-[var(--erp-fg-muted)]">
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 font-semibold">
                <button
                  type="button"
                  onClick={() => toggleSort(col.key)}
                  className="hover:text-[var(--erp-fg)]"
                >
                  {col.label}
                  {indicator(col.key)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((card) => {
            const funilName = card.funil?.name ?? funilNameById[card.funilId] ?? '—';
            return (
              <tr
                key={card.id}
                onClick={() => props.onOpenCard(card)}
                className="cursor-pointer border-b border-[var(--erp-border)] transition hover:bg-gray-100"
              >
                <td className="px-4 py-3 font-medium text-[var(--erp-fg)]">{card.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${CRM_ORIGIN_BADGE_CLASS[card.origin]}`}
                  >
                    {CRM_ORIGIN_LABEL[card.origin]}
                  </span>
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
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 text-[var(--erp-fg-secondary)]">{funilName}</td>
                <td className="px-4 py-3 text-[var(--erp-fg)]">
                  {card.value ? formatCrmCurrency(card.value) : '—'}
                </td>
                <td className="px-4 py-3 text-[var(--erp-fg-secondary)]">{card.touchPoints}</td>
                <td className="px-4 py-3">
                  <CrmLeadScoreThermometer score={card.score ?? 0} compact showLabel={false} />
                </td>
                <td className="px-4 py-3 text-[var(--erp-fg-secondary)]">
                  {card.responsavel?.name ?? '—'}
                </td>
                <td className="px-4 py-3 text-[var(--erp-fg-muted)]">
                  {formatActivity(card.lastTouchpointAt ?? card.updatedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
