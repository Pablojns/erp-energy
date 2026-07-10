import { CorreiosWorkspace } from '@/src/components/correios/correios-workspace';
import { getAuthenticatedUserOrRedirect } from '@/src/services/auth/session';

export default async function CorreiosPage() {
  await getAuthenticatedUserOrRedirect();
  return <CorreiosWorkspace />;
}
