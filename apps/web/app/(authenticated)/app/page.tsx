import { DashboardView } from '@/src/components/dashboard/dashboard-view';
import { getAuthenticatedUserOrRedirect } from '@/src/services/auth/session';

export default async function AuthenticatedHomePage() {
  await getAuthenticatedUserOrRedirect();
  return (
    <div className="dash-page-root w-full min-h-0">
      <DashboardView />
    </div>
  );
}
