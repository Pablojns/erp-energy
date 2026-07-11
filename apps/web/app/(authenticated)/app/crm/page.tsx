import { CrmWorkspace } from '@/src/components/crm/crm-workspace';
import { getAuthenticatedUserOrRedirect } from '@/src/services/auth/session';

export default async function CrmPage() {
  const user = await getAuthenticatedUserOrRedirect();
  return <CrmWorkspace isAdmin={user.roles.includes('ADMIN')} />;
}
