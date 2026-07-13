import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedUserOrRedirect } from '@/src/services/auth/session';
import { ConfiguracoesAdminClient } from './configuracoes-admin-client';

export const metadata: Metadata = {
  title: 'Configurações | Energy Brands — ERP',
  description: 'Preferências do sistema, usuários e produtos.',
};

export default async function ConfiguracoesPage() {
  const user = await getAuthenticatedUserOrRedirect();
  const isAdmin = user.roles.includes('ADMIN');

  return (
    <div className="space-y-6">
      <section className="erp-module-card p-6">
        <h2 className="text-2xl font-bold text-[#0f172a]">
          {isAdmin ? 'Configurações do Sistema' : 'Configurações'}
        </h2>
        <p className="mt-2 text-sm text-[#7A7A7A]">
          {isAdmin
            ? 'Gerencie usuários, permissões, produtos inativos e notificações.'
            : 'Personalize suas preferências de notificações.'}
        </p>
      </section>

      <ConfiguracoesAdminClient isAdmin={isAdmin} />
    </div>
  );
}
