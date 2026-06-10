import { NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  getBackendApiBaseUrl,
} from '@/src/services/api/config';
import { formatNestAuthError, type AuthResponse } from '@/src/services/api/auth';

/** Garante que o POST não seja tratado como estático omitido em builds. */
export const dynamic = 'force-dynamic';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'JSON inválido no corpo da requisição.' }, {
      status: 400,
    });
  }

  const parsed = body as { email?: unknown; password?: unknown };
  const email =
    typeof parsed.email === 'string' ? parsed.email.trim().toLowerCase() : '';
  const password = typeof parsed.password === 'string' ? parsed.password : '';

  if (!email || !password) {
    return NextResponse.json(
      { message: 'E-mail e senha são obrigatórios.' },
      { status: 400 },
    );
  }

  const apiBase = getBackendApiBaseUrl();
  let upstream: Response;
  try {
    upstream = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { message: 'Não foi possível contatar o servidor da API.' },
      { status: 502 },
    );
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    payload = {};
  }

  if (!upstream.ok) {
    const message = formatNestAuthError(payload);
    return NextResponse.json(
      { message },
      { status: upstream.status >= 400 ? upstream.status : 502 },
    );
  }

  const data = payload as Partial<AuthResponse>;
  const accessToken =
    typeof data.accessToken === 'string' ? data.accessToken : '';
  if (!accessToken) {
    return NextResponse.json(
      { message: 'Resposta inválida da API (sem accessToken).' },
      { status: 502 },
    );
  }

  const res = NextResponse.json({
    user: data.user,
    tokenType: data.tokenType ?? 'Bearer',
    expiresIn: data.expiresIn ?? '1d',
  });

  res.cookies.set(AUTH_COOKIE_NAME, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  return res;
}
