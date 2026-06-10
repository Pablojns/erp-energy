import { AdvancedFilters } from '@/src/components/ui/advanced-filters';
import { EmptyState } from '@/src/components/ui/empty-state';
import { OperationalCard } from '@/src/components/ui/operational-card';
import { OperationalWidget } from '@/src/components/ui/operational-widget';

export default function FinanceiroPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-[#121724] p-6">
        <h2 className="text-2xl font-semibold text-zinc-100">Financeiro</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Central financeira com contas, vencimentos, fluxo de caixa, pagamentos,
          fornecedores e transportadoras.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OperationalCard label="Contas a pagar" value="R$ 142k" delta="7 dias" tone="warning" />
        <OperationalCard label="Contas a receber" value="R$ 198k" delta="+4.9%" tone="success" />
        <OperationalCard label="Fluxo de caixa" value="R$ 56k" delta="-2.3%" tone="danger" />
        <OperationalCard label="Vencimentos hoje" value="13 titulos" delta="Urgente" tone="accent" />
      </section>

      <AdvancedFilters
        title="Filtros financeiros"
        filters={[
          {
            label: 'Tipo',
            options: [
              { label: 'Todos', value: 'all' },
              { label: 'Pagar', value: 'payable' },
              { label: 'Receber', value: 'receivable' },
            ],
          },
          {
            label: 'Status',
            options: [
              { label: 'Todos', value: 'all' },
              { label: 'Pendente', value: 'pending' },
              { label: 'Pago', value: 'paid' },
              { label: 'Atrasado', value: 'overdue' },
            ],
          },
          {
            label: 'Categoria',
            options: [
              { label: 'Todas', value: 'all' },
              { label: 'Fornecedor', value: 'supplier' },
              { label: 'Transportadora', value: 'carrier' },
              { label: 'Impostos', value: 'taxes' },
            ],
          },
          {
            label: 'Periodo',
            options: [
              { label: 'Hoje', value: 'today' },
              { label: 'Semana', value: 'week' },
              { label: 'Mes', value: 'month' },
            ],
          },
        ]}
      />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <OperationalWidget title="Boletos emitidos" value="87" accent="blue" />
        <OperationalWidget title="Comprovantes pendentes" value="14" accent="amber" />
        <OperationalWidget title="Pagamentos agendados" value="32" accent="green" />
      </section>

      <EmptyState
        title="Painel financeiro premium"
        description="Area preparada para DRE simplificado, curva de caixa, aging list e analise de inadimplencia."
        actionLabel="Configurar widgets"
      />
    </div>
  );
}
