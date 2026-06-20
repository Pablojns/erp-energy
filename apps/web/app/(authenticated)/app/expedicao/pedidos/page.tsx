import { ExpeditionWorkspace } from '@/src/components/expedicao/workspace/expedition-workspace';
import { getAuthenticatedUserOrRedirect } from '@/src/services/auth/session';
import type { StatusFilterId } from '@/src/components/expedicao/shared/types';

const ALLOWED_FILTERS: StatusFilterId[] = [
  'all',
  'novo',
  'em_separacao',
  'aguardando_nf',
  'finalizado',
  'cancelado',
];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ExpedicaoPedidosPage(props: {
  searchParams: SearchParams;
}) {
  const user = await getAuthenticatedUserOrRedirect();
  const isAdmin = user.roles.includes('ADMIN');
  const params = await props.searchParams;
  const raw = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  const filter = ALLOWED_FILTERS.includes(raw as StatusFilterId)
    ? (raw as StatusFilterId)
    : 'all';
  return (
    <ExpeditionWorkspace mode="orders" initialStatusFilter={filter} isAdmin={isAdmin} />
  );
}
