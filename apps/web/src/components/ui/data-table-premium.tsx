'use client';

import type { ReactNode } from 'react';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { GlassCard } from '@/src/components/shell/glass-card';

export type TableColumn = {
  key: string;
  header: string;
  className?: string;
  renderCell?: (ctx: {
    value: string;
    rowId: string;
    row: TableRow;
  }) => ReactNode;
};

export type TableRow = {
  id: string;
  priority?: 'normal' | 'high' | 'critical';
  values: Record<string, string>;
  status?: {
    label: string;
    tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
  };
};

export type PremiumColumn = TableColumn;
export type PremiumRow = TableRow;

type DataTablePremiumProps = {
  title: string;
  subtitle?: string;
  columns: TableColumn[];
  rows: TableRow[];
  /** @default true — listagens sem status (ex.: movimentações) */
  showStatusColumn?: boolean;
  onRowClick?: (row: TableRow) => void;
  /** Coluna extra para botões (ex.: editar / inativar produto) */
  actionsColumn?: {
    header: string;
    /** @default 'right' */
    align?: 'left' | 'right' | 'center';
    /** Largura fixa da coluna (tailwind), ex.: `w-[220px] min-w-[220px]` */
    columnClassName?: string;
    render: (row: TableRow) => ReactNode;
  };
};

const PRIORITY_DOT: Record<NonNullable<TableRow['priority']>, string> = {
  normal: 'bg-emerald-400/90 shadow-[0_0_10px_rgba(52,211,153,0.45)]',
  high: 'bg-amber-400/95 shadow-[0_0_10px_rgba(251,191,36,0.45)]',
  critical: 'bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.55)]',
};

const PRIORITY_TEXT: Record<NonNullable<TableRow['priority']>, string> = {
  normal: 'text-emerald-200',
  high: 'text-amber-200',
  critical: 'text-rose-200',
};

function TableCellContents({
  columnKey,
  value,
  row,
}: {
  columnKey: string;
  value: string;
  row: TableRow;
}) {
  if (columnKey === 'prioridade' && row.priority) {
    return (
      <span className="inline-flex items-center gap-2.5 tabular-nums">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ring-2 ring-black/10 ${PRIORITY_DOT[row.priority]}`}
          aria-hidden
        />
        <span className={`font-semibold ${PRIORITY_TEXT[row.priority]}`}>
          {value}
        </span>
      </span>
    );
  }

  const isPedido =
    columnKey === 'pedido' || columnKey.includes('titulo') || columnKey.includes('valor');
  if (isPedido) {
    return <span className="font-semibold tracking-tight text-[var(--text-primary)]">{value}</span>;
  }

  return <span className="leading-snug text-[var(--text-primary)]">{value}</span>;
}

export function DataTablePremium({
  title,
  subtitle,
  columns,
  rows,
  showStatusColumn = true,
  onRowClick,
  actionsColumn,
}: DataTablePremiumProps) {
  const actionsAlign =
    actionsColumn?.align === 'center'
      ? 'text-center'
      : actionsColumn?.align === 'left'
        ? 'text-left'
        : 'text-right';

  return (
    <GlassCard className="relative overflow-hidden border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="relative border-b border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[var(--border-color)]"
          aria-hidden
        />
        <h3 className="text-xs font-semibold tracking-tight text-[var(--text-primary)]">{title}</h3>
        {subtitle ? (
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{subtitle}</p>
        ) : null}
      </div>

      <div className="erp-scrollbar -mx-px overflow-x-auto">
        <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left lg:min-w-0 lg:table-fixed">
          <colgroup>
            {columns.map((column) => (
              <col
                key={`col-${column.key}`}
                className={
                  column.key === 'prioridade'
                    ? 'lg:w-[12%]'
                    : column.key === 'pedido'
                      ? 'lg:w-[11%]'
                      : column.key === 'hora'
                        ? 'lg:w-[11%]'
                        : column.key === 'sla'
                          ? 'lg:w-[12%]'
                          : undefined
                }
              />
            ))}
            {actionsColumn ? (
              <col
                className={
                  actionsColumn.columnClassName ?? 'w-[200px] min-w-[200px]'
                }
              />
            ) : null}
            {showStatusColumn ? <col className="lg:w-[16%]" /> : null}
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--border-color)] text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`sticky top-0 z-[1] border-b border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 backdrop-blur-sm first:rounded-tl-none ${column.className ?? ''}`}
                  scope="col"
                >
                  {column.header}
                </th>
              ))}
              {actionsColumn ? (
                <th
                  className={`sticky top-0 z-[1] border-b border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 backdrop-blur-sm ${actionsAlign}`}
                  scope="col"
                >
                  {actionsColumn.header}
                </th>
              ) : null}
              {showStatusColumn ? (
                <th
                  className="sticky top-0 z-[1] border-b border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-right backdrop-blur-sm"
                  scope="col"
                >
                  Status
                </th>
              ) : null}
            </tr>
          </thead>

          <tbody className="text-xs">
            {rows.map((row, index) => (
              <tr
                key={row.id}
                className={`group border-b border-[var(--border-color)] text-[var(--text-primary)] transition duration-200 last:border-b-0 ${index % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--input-bg)]'} hover:bg-[var(--input-bg)]${onRowClick ? ' cursor-pointer' : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'button' : undefined}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`max-w-0 border-b border-[var(--border-color)] px-2 py-1 align-middle transition duration-200 group-hover:border-[var(--border-color)] ${column.className ?? ''}`}
                  >
                    {column.renderCell ? (
                      <div className="min-w-0">{column.renderCell({
                        value: row.values[column.key],
                        rowId: row.id,
                        row,
                      })}</div>
                    ) : (
                      <span
                        className="block truncate"
                        title={row.values[column.key]}
                      >
                        <TableCellContents
                          columnKey={column.key}
                          value={row.values[column.key]}
                          row={row}
                        />
                      </span>
                    )}
                  </td>
                ))}
                {actionsColumn ? (
                  <td
                    className={`border-b border-[var(--border-color)] px-2 py-1 align-middle transition duration-200 group-hover:border-[var(--border-color)] ${actionsAlign}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {actionsColumn.render(row)}
                  </td>
                ) : null}
                {showStatusColumn ? (
                  <td className="border-b border-[var(--border-color)] px-2 py-1 text-right align-middle transition duration-200 group-hover:border-[var(--border-color)]">
                    {row.status ? (
                      <div className="flex justify-end">
                        <StatusBadge
                          label={row.status.label}
                          tone={row.status.tone ?? 'neutral'}
                        />
                      </div>
                    ) : (
                      <div className="flex justify-end">
                        <StatusBadge label="Sem status" />
                      </div>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

/** Alias for compatibilidade com código existente */
export const PremiumDataTable = DataTablePremium;
