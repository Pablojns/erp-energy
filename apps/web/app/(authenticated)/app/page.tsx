import { DashboardView } from '@/src/components/dashboard/dashboard-view';
import { getAuthenticatedUserOrRedirect } from '@/src/services/auth/session';

export default async function AuthenticatedHomePage() {
  const user = await getAuthenticatedUserOrRedirect();
  return <DashboardView userName={user.name} />;
}
