import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/src/services/api/config';

const clearedCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 0,
};

/**
 * GET: usado pelo layout autenticado quando `/auth/me` falha — zera cookie e redireciona ao login sem erro em RSC.
 */
export async function GET(request: NextRequest) {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('reason', 'session');
  const res = NextResponse.redirect(loginUrl);
  res.cookies.set(AUTH_COOKIE_NAME, '', clearedCookie);
  return res;
}

export async function POST() {
  (await cookies()).set(AUTH_COOKIE_NAME, '', clearedCookie);

  return NextResponse.json({ success: true });
}
