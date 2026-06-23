import Link from 'next/link';
import { FileText, Package, Plus } from 'lucide-react';
import { PeriodSelector } from '@/src/components/dashboard/period-selector';
import { formatLongDate } from '@/src/components/dashboard/utils';
import type { PeriodPreset } from '@/src/components/dashboard/types';

type DashboardHeaderProps = {
  userName: string;
  preset: PeriodPreset;
  customInicio: string;
  customFim: string;
  onPresetChange: (preset: PeriodPreset) => void;
  onCustomInicioChange: (value: string) => void;
  onCustomFimChange: (value: string) => void;
};

export function DashboardHeader({
  userName,
  preset,
  customInicio,
  customFim,
  onPresetChange,
  onCustomInicioChange,
  onCustomFimChange,
}: DashboardHeaderProps) {
  const firstName = userName.split(' ')[0] ?? userName;

  return (
    <header className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--dash-text)] sm:text-3xl">
            Dashboard Operacional
          </h1>
          <p className="mt-1.5 text-sm text-[var(--dash-text-muted)]">
            {formatLongDate()} · {firstName}
          </p>
        </div>
        <PeriodSelector
          preset={preset}
          customInicio={customInicio}
          customFim={customFim}
          onPresetChange={onPresetChange}
          onCustomInicioChange={onCustomInicioChange}
          onCustomFimChange={onCustomFimChange}
        />
      </div>

      <div className="flex flex-wrap gap-2 xl:justify-end">
        <Link href="/app/expedicao/pedidos" className="dash-btn-primary">
          <Plus size={16} strokeWidth={2} />
          Novo Pedido
        </Link>
        <Link href="/app/expedicao/separacao" className="dash-btn-secondary">
          <Package size={16} strokeWidth={1.75} />
          Separação Rápida
        </Link>
        <Link href="/app/expedicao/pedidos" className="dash-btn-secondary">
          <FileText size={16} strokeWidth={1.75} />
          Emitir NF
        </Link>
      </div>
    </header>
  );
}
