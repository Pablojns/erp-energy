import { DashboardView } from '@/src/components/dashboard/dashboard-view';
import { getAuthenticatedUserOrRedirect } from '@/src/services/auth/session';

export default async function AuthenticatedHomePage() {
  await getAuthenticatedUserOrRedirect();
  return (
    <div className="dash-page-root dash-page-root--overview w-full min-h-0 overflow-hidden">
      <DashboardView />
    </div>
  );
}
