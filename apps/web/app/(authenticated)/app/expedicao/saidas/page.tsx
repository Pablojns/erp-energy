import { ExitsPage } from '@/src/components/expedicao/outputs/exits-page';
import { getAuthenticatedUserOrRedirect } from '@/src/services/auth/session';

export default async function SaidasPage() {
  const user = await getAuthenticatedUserOrRedirect();
  const isAdmin = user.roles.includes('ADMIN');
  return <ExitsPage isAdmin={isAdmin} />;
}
