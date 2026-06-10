import { PremiumDataTable } from '@/src/components/ui/premium-data-table';
import { StatusBadge } from '@/src/components/ui/status-badge';

export default function AuditoriaPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-[#121724] p-6">
        <h2 className="text-2xl font-semibold text-zinc-100">Auditoria</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Rastreabilidade completa de eventos, alteracoes e acoes críticas.
        </p>
      </section>

      <PremiumDataTable
        title="Eventos recentes"
        subtitle="Visao de logs operacionais e administrativos."
        columns={[
          { key: 'acao', header: 'Acao' },
          { key: 'entidade', header: 'Entidade' },
          { key: 'usuario', header: 'Usuario' },
          { key: 'momento', header: 'Momento' },
          { key: 'origem', header: 'Origem' },
        ]}
        rows={[
          {
            id: 'a1',
            priority: 'high',
            values: {
              acao: 'Atualizacao de status',
              entidade: 'Pedido #45173654',
              usuario: 'Pablo',
              momento: '11:28',
              origem: 'Expedicao',
            },
            status: { label: 'Acompanhando', tone: 'warning' },
          },
          {
            id: 'a2',
            priority: 'normal',
            values: {
              acao: 'Login',
              entidade: 'Auth',
              usuario: 'Camila',
              momento: '11:11',
              origem: 'Web',
            },
            status: { label: 'Normal', tone: 'info' },
          },
          {
            id: 'a3',
            priority: 'critical',
            values: {
              acao: 'Tentativa bloqueada',
              entidade: 'Permissao',
              usuario: 'N/A',
              momento: '10:52',
              origem: 'API',
            },
            status: { label: 'Critico', tone: 'danger' },
          },
        ]}
      />

      <div className="rounded-2xl border border-white/10 bg-[#121724] p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-300">Integridade de logs</p>
          <StatusBadge label="Saudavel" tone="success" />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Arquitetura pronta para trilha de auditoria detalhada por entidade e usuário.
        </p>
      </div>
    </div>
  );
}
