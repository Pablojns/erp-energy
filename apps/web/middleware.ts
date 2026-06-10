import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const AUTH_DISABLED = process.env.NEXT_PUBLIC_AUTH_DISABLED === 'true';
const AUTH_COOKIE_NAME = 'erp_token';
const PUBLIC_PATHS = ['/login'];
const PUBLIC_FILE = /\.(.*)$/;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (AUTH_DISABLED) {
    if (pathname === '/' || pathname.startsWith('/login')) {
      return NextResponse.redirect(new URL('/app', request.url));
    }
    return NextResponse.next();
  }

  /** Atalhos legados ou sem prefixo `/app` — mesmo shell autenticado que `/app/expedicao`. */
  if (
    pathname === '/expedicao' ||
    pathname === '/shipping' ||
    pathname === '/logistics'
  ) {
    const url = new URL(`/app/expedicao${request.nextUrl.search}`, request.url);
    return NextResponse.redirect(url);
  }

  const isPublicPath = PUBLIC_PATHS.some((publicPath) =>
    pathname.startsWith(publicPath),
  );
  const isNextAsset =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/public');
  const isPublicFile = PUBLIC_FILE.test(pathname);

  // Never block public routes and static assets.
  if (isPublicPath || isNextAsset || isPublicFile || pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (pathname.startsWith('/app') && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
