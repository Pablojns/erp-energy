'use client';

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

const PIE_COLORS = ['#f87171', '#fb923c', '#fbbf24', '#a78bfa', '#60a5fa', '#34d399', '#94a3b8'];

export function CrmMotivosPerdaPieChart(props: {
  data: Array<{ motivoId: string; motivoName: string; count: number }>;
  title?: string;
}) {
  if (props.data.length === 0) {
    return (
      <div className="erp-module-card p-4">
        <h3 className="text-sm font-semibold text-[var(--erp-fg)]">
          {props.title ?? 'Motivos de perda'}
        </h3>
        <p className="mt-4 text-sm text-[var(--erp-fg-muted)]">
          Nenhum lead perdido com motivo registrado no período.
        </p>
      </div>
    );
  }

  const chartData = props.data.map((row) => ({
    name: row.motivoName,
    value: row.count,
  }));

  return (
    <div className="erp-module-card p-4">
      <h3 className="text-sm font-semibold text-[var(--erp-fg)]">
        {props.title ?? 'Motivos de perda'}
      </h3>
      <p className="mt-1 text-xs text-[var(--erp-fg-muted)]">
        Distribuição dos leads marcados como perdidos
      </p>
      <div className="mt-4 h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={88}
              label={({ name, percent }) =>
                `${name} (${((percent ?? 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%)`
              }
            >
              {chartData.map((_, index) => (
                <Cell
                  key={index}
                  fill={PIE_COLORS[index % PIE_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'var(--erp-bg-elevated)',
                border: '1px solid var(--erp-border)',
                borderRadius: 12,
                color: 'var(--erp-fg)',
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
