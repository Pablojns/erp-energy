import { cookies } from 'next/headers';
import { API_BASE_URL, AUTH_COOKIE_NAME } from '@/src/services/api/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return new Response('Não autenticado.', { status: 401 });
  }

  const upstream = await fetch(`${API_BASE_URL}/api/notifications/stream`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'text/event-stream',
    },
    cache: 'no-store',
  });

  if (!upstream.ok || !upstream.body) {
    return new Response('Falha ao conectar ao stream.', {
      status: upstream.status || 502,
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
