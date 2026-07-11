import { CrmWorkspace } from '@/src/components/crm/crm-workspace';
import { getAuthenticatedUserOrRedirect } from '@/src/services/auth/session';

export default async function CrmPage() {
  await getAuthenticatedUserOrRedirect();
  return <CrmWorkspace />;
}
