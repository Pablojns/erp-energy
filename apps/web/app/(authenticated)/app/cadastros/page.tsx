import { getAuthenticatedUserOrRedirect } from '@/src/services/auth/session';
import { CadastrosClient } from './cadastros-client';

export default async function CadastrosPage() {
  const user = await getAuthenticatedUserOrRedirect();
  const isAdmin = user.roles.includes('ADMIN');

  return (
    <div className="space-y-6">
      <section className="erp-module-card p-6">
        <h2 className="text-2xl font-semibold text-zinc-100">Cadastros</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Recebedores, pontos de descarga, transportadoras, fornecedores e clientes.
          {!isAdmin ? ' Você pode visualizar os registros; alterações são restritas a administradores.' : null}
        </p>
      </section>

      <CadastrosClient isAdmin={isAdmin} />
    </div>
  );
}
