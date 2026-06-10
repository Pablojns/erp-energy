'use client';

import {
  FileStack,
  MoreHorizontal,
  Package,
  Plus,
  Sparkles,
} from 'lucide-react';
import { ActivityFeed } from '@/src/components/dashboard/activity-feed';
import { FilterBar } from '@/src/components/dashboard/filter-bar';
import { KpiWidget } from '@/src/components/dashboard/kpi-widget';
import { OperationalFlowChart } from '@/src/components/dashboard/operational-flow-chart';
import { GlowButton } from '@/src/components/shell/glow-button';
import { GlassCard } from '@/src/components/shell/glass-card';
import {
  DataTablePremium,
  type TableColumn,
  type TableRow,
} from '@/src/components/ui/data-table-premium';

type DashboardViewProps = {
  userName: string;
};

const orderColumns: TableColumn[] = [
  { key: 'pedido', header: 'Pedido' },
  { key: 'cliente', header: 'Cliente' },
  { key: 'prioridade', header: 'Prioridade' },
  { key: 'hora', header: 'Atualizado' },
];

const orderRows: TableRow[] = [
  {
    id: 'o1',
    priority: 'critical',
    values: {
      pedido: '#45173654',
      cliente: 'Hospital Santa Cruz',
      prioridade: 'Alta',
      hora: '10:42',
    },
    status: { label: 'Separação', tone: 'accent' },
  },
  {
    id: 'o2',
    priority: 'high',
    values: {
      pedido: '#45173658',
      cliente: 'Clínica Vitta',
      prioridade: 'Média',
      hora: '10:38',
    },
    status: { label: 'Conferência', tone: 'info' },
  },
  {
    id: 'o3',
    priority: 'normal',
    values: {
      pedido: '#45173662',
      cliente: 'Lab Norte',
      prioridade: 'Baixa',
      hora: '10:31',
    },
    status: { label: 'Faturamento', tone: 'success' },
  },
];

export function DashboardView({ userName }: DashboardViewProps) {
  const firstName = userName.split(' ')[0] ?? userName;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight text-[var(--text-title)] sm:gap-2.5 sm:text-3xl">
            <span>
              Bem-vindo de volta, {firstName}
            </span>
            <Sparkles
              className="h-6 w-6 shrink-0 text-sky-400/85 sm:h-7 sm:w-7"
              strokeWidth={1.5}
              aria-hidden
            />
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--text-secondary)]">
            Aqui está o panorama geral da sua operação hoje — pedidos, estoque e
            financeiro em um só lugar.
          </p>
        </div>
        <div className="w-full lg:max-w-xl">
          <FilterBar />
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiWidget
          title="Pedidos do dia"
          value="48"
          delta="+12% vs ontem"
          glow="blue"
          iconName="shoppingCart"
        />
        <KpiWidget
          title="Em separação"
          value="23"
          subtitle="Em andamento"
          glow="violet"
          iconName="package"
          sparkPoints="0,30 16,28 32,24 48,26 64,16 80,20 100,14"
        />
        <KpiWidget
          title="Pendentes expedição"
          value="15"
          subtitle="Urgentes: 3"
          glow="amber"
          iconName="truck"
        />
        <KpiWidget
          title="Faturados hoje"
          value="32"
          subtitle="R$ 85.340,50"
          glow="emerald"
          iconName="dollarSign"
        />
        <KpiWidget
          title="Estoque baixo"
          value="18"
          subtitle="Itens críticos"
          glow="rose"
          iconName="alertTriangle"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <OperationalFlowChart />
        </div>
        <div className="space-y-4 lg:col-span-6">
          <DataTablePremium
            title="Pedidos em andamento"
            subtitle="Prioridade e SLA em tempo real"
            columns={orderColumns}
            rows={orderRows}
          />
        </div>
        <div className="lg:col-span-12">
          <ActivityFeed />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <GlassCard className="p-4 lg:col-span-8">
          <h3 className="text-sm font-semibold text-[var(--text-title)]">Alertas importantes</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.07] px-4 py-3 ring-1 ring-rose-400/15">
              <p className="text-sm font-medium text-rose-200">3 pedidos urgentes</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">SLA menor que 1h na conferência</p>
            </div>
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 ring-1 ring-amber-400/15">
              <p className="text-sm font-medium text-amber-200">Estoque crítico</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">18 SKUs abaixo do mínimo</p>
            </div>
            <div className="rounded-xl border border-sky-500/25 bg-sky-500/[0.07] px-4 py-3 ring-1 ring-sky-400/15">
              <p className="text-sm font-medium text-sky-200">Notas pendentes</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">7 NF-e aguardando envio</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="flex flex-col justify-center gap-3 p-4 lg:col-span-4">
          <h3 className="text-sm font-semibold text-[var(--text-title)]">Ações rápidas</h3>
          <div className="flex flex-wrap gap-2">
            <GlowButton variant="secondary" className="gap-2 py-2 text-xs sm:text-sm">
              <Plus className="h-4 w-4" strokeWidth={2} />
              Novo pedido
            </GlowButton>
            <GlowButton variant="secondary" className="gap-2 py-2 text-xs sm:text-sm">
              <Package className="h-4 w-4" strokeWidth={1.75} />
              Separação rápida
            </GlowButton>
            <GlowButton variant="secondary" className="gap-2 py-2 text-xs sm:text-sm">
              <FileStack className="h-4 w-4" strokeWidth={1.75} />
              Gerar romaneio
            </GlowButton>
            <GlowButton variant="secondary" className="gap-2 py-2 text-xs sm:text-sm">
              <FileStack className="h-4 w-4" strokeWidth={1.75} />
              Emitir nota
            </GlowButton>
            <GlowButton variant="ghost" className="gap-1 py-2 text-xs text-[var(--text-secondary)] sm:text-sm">
              <MoreHorizontal className="h-4 w-4" />
              Mais ações
            </GlowButton>
          </div>
        </GlassCard>
      </section>
    </div>
  );
}
