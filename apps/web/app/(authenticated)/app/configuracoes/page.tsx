import { EmptyState } from '@/src/components/ui/empty-state';
import { QuickActions } from '@/src/components/ui/quick-actions';

export default function ConfiguracoesPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-[#121724] p-6">
        <h2 className="text-2xl font-semibold text-zinc-100">Configuracoes</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Parametros gerais, perfis de acesso, integrações e politicas do sistema.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <EmptyState
            title="Painel administrativo"
            description="Espaco reservado para controles de perfil, permissao, regras de negocio e integracoes externas."
            actionLabel="Adicionar secao"
          />
        </div>
        <QuickActions
          actions={[
            { label: 'Gerenciar perfis', description: 'Permissoes por setor e equipe.' },
            { label: 'Parametros fiscais', description: 'Regras de nota e tributacao.' },
            { label: 'Integracoes', description: 'Conectar serviços externos.' },
          ]}
        />
      </section>
    </div>
  );
}
