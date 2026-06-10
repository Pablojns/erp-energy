import { ExpeditionWorkspace } from '@/src/components/expedicao/workspace/expedition-workspace';
import type { StatusFilterId } from '@/src/components/expedicao/shared/types';

const ALLOWED_FILTERS: StatusFilterId[] = [
  'all',
  'urgente',
  'atrasado',
  'em_separacao',
  'aguardando_nf',
  'parcial',
  'aguardando_estoque',
  'pronto_separacao',
  'finalizado',
  'cancelado',
  'cotacao',
];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ExpedicaoPedidosPage(props: {
  searchParams: SearchParams;
}) {
  const params = await props.searchParams;
  const raw = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  const filter = ALLOWED_FILTERS.includes(raw as StatusFilterId)
    ? (raw as StatusFilterId)
    : 'all';
  return <ExpeditionWorkspace mode="orders" initialStatusFilter={filter} />;
}
