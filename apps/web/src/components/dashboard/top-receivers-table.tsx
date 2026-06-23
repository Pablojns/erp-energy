import type { DashboardRankingItem } from '@/src/components/dashboard/types';
import { formatCurrency } from '@/src/components/dashboard/utils';

type TopReceiversTableProps = {
  items: DashboardRankingItem[];
};

export function TopReceiversTable({ items }: TopReceiversTableProps) {
  return (
    <div className="dash-card p-4 sm:p-5 h-full">
      <h2 className="text-sm font-semibold text-[var(--dash-text)]">Top 5 recebedores</h2>
      <p className="mt-0.5 text-xs text-[var(--dash-text-muted)]">Por valor no período</p>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--dash-text-muted)]">Nenhum recebedor no período.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="dash-table w-full">
            <thead>
              <tr>
                <th>Recebedor</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => (
                <tr key={`${row.nome}-${i}`}>
                  <td className="max-w-[180px] truncate font-medium" title={row.nome}>
                    {row.nome}
                  </td>
                  <td className="text-right tabular-nums">{formatCurrency(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function TopReceiversTableSkeleton() {
  return (
    <div className="dash-card p-5 space-y-4 h-full">
      <div className="dash-skeleton h-4 w-36" />
      <div className="dash-skeleton h-3 w-28" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="dash-skeleton h-8 w-full" />
        ))}
      </div>
    </div>
  );
}
