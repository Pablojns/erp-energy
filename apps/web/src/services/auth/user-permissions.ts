import { API_BASE_URL } from '@/src/services/api/config';
import type { UserPermissionGrant } from '@/src/services/auth/nav-access';

type ApiUserPermission = {
  module: string;
  action: string;
  granted: boolean;
};

export async function fetchUserPermissions(
  userId: string,
  token: string,
): Promise<UserPermissionGrant[]> {
  const response = await fetch(`${API_BASE_URL}/api/users/${userId}/permissions`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return [];
  }

  const rows = (await response.json()) as ApiUserPermission[];
  return rows.map((row) => ({
    module: row.module,
    action: row.action,
    granted: row.granted,
  }));
}
