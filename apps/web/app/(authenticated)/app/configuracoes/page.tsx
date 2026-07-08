import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedUserOrRedirect } from '@/src/services/auth/session';
import { ConfiguracoesAdminClient } from './configuracoes-admin-client';

export const metadata: Metadata = {
  title: 'Configurações Admin | ERP Energy',
  description: 'Painel de administração de usuários e produtos inativos.',
};

export default async function ConfiguracoesPage() {
  const user = await getAuthenticatedUserOrRedirect();

  // Acesso restrito: apenas ADMIN enxerga o painel de configurações.
  if (!user.roles.includes('ADMIN')) {
    redirect('/app');
  }

  return (
    <div className="space-y-6">
      <section className="erp-module-card p-6">
        <h2 className="text-2xl font-semibold text-zinc-100">
          Configurações do Sistema
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          Gerencie usuários, permissões e produtos inativos.
        </p>
      </section>

      <ConfiguracoesAdminClient />
    </div>
  );
}
