import { cookies } from 'next/headers';
import { ChatClient } from '@/app/(authenticated)/app/chat/chat-client';
import { AUTH_COOKIE_NAME } from '@/src/services/api/config';
import { getAuthenticatedUserOrRedirect } from '@/src/services/auth/session';
import { isAuthDisabled } from '@/src/services/auth/bypass';

export default async function ChatPage() {
  const user = await getAuthenticatedUserOrRedirect();
  const token = isAuthDisabled()
    ? ''
    : ((await cookies()).get(AUTH_COOKIE_NAME)?.value ?? '');

  return <ChatClient currentUser={user} wsToken={token} />;
}
