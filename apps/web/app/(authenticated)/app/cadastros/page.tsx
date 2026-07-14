import { getAuthenticatedUserOrRedirect } from '@/src/services/auth/session';
import { CadastrosClient } from './cadastros-client';

export default async function CadastrosPage() {
  const user = await getAuthenticatedUserOrRedirect();
  const isAdmin = user.roles.includes('ADMIN');

  return (
    <div className="erp-module-page flex h-[calc(100dvh-7.5rem)] min-h-0 flex-col gap-4 overflow-hidden">
      <section className="erp-module-card shrink-0 p-6">
        <h2 className="text-2xl font-semibold text-gray-900">Cadastros</h2>
        <p className="mt-2 text-sm text-gray-600">
          Recebedores, pontos de descarga, transportadoras, fornecedores e clientes.
          {!isAdmin ? ' Você pode visualizar os registros; alterações são restritas a administradores.' : null}
        </p>
      </section>

      <CadastrosClient isAdmin={isAdmin} />
    </div>
  );
}
