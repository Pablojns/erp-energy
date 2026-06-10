import { EmptyState } from '@/src/components/ui/empty-state';
import { OperationalCard } from '@/src/components/ui/operational-card';
import { QuickActions } from '@/src/components/ui/quick-actions';
import { TaskCard } from '@/src/components/ui/task-card';

export default function CrmPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
        <h2 className="text-2xl font-semibold text-[var(--text-primary)]">CRM</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Clientes, contatos, pedidos, follow-ups e historico de relacionamento em uma
          visao comercial integrada.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OperationalCard label="Clientes ativos" value="1.284" delta="+5.2%" tone="success" />
        <OperationalCard label="Follow-ups hoje" value="46" delta="Prioridade" tone="warning" />
        <OperationalCard label="Pedidos vinculados" value="213" delta="+11" tone="info" />
        <OperationalCard label="Interacoes abertas" value="28" delta="Ação" tone="accent" />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <article className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Carteira e relacionamento
            </h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Segmentacao de clientes por potencial, pedidos recentes e risco de churn.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <TaskCard
                title="Follow-up com cliente Hospital Santa Cruz"
                owner="Camila"
                due="Hoje 16:30"
                priority="high"
              />
              <TaskCard
                title="Revisar condicao comercial cliente Vitta"
                owner="Rafael"
                due="Amanha 10:00"
                priority="normal"
              />
            </div>
          </article>

          <EmptyState
            title="Pipeline comercial premium"
            description="Area pronta para cards por etapa comercial, taxa de conversao e historico de negociacao por cliente."
            actionLabel="Configurar pipeline"
          />
        </div>

        <QuickActions
          actions={[
            { label: 'Cadastrar conta', description: 'Cadastrar conta e contatos principais.' },
            { label: 'Adicionar historico', description: 'Adicionar historico de atendimento.' },
            { label: 'Agendar proximo contato', description: 'Agendar proximo contato comercial.' },
          ]}
        />
      </section>
    </div>
  );
}
