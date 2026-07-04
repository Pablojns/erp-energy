import { ComprasWorkspace } from '@/src/components/compras/compras-workspace';
import { getAuthenticatedUserOrRedirect } from '@/src/services/auth/session';

export default async function ComprasPage() {
  const user = await getAuthenticatedUserOrRedirect();
  const isAdmin = user.roles.includes('ADMIN');
  return <ComprasWorkspace isAdmin={isAdmin} />;
}
