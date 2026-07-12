import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { API_BASE_URL, AUTH_COOKIE_NAME } from '@/src/services/api/config';
import { DEV_MOCK_USER, isAuthDisabled } from '@/src/services/auth/bypass';

function isAuthPath(path: string): boolean {
  return (
    /^auth\/me$/i.test(path) ||
    /^auth\/register$/i.test(path) ||
    /^auth\/users$/i.test(path) ||
    /^auth\/users\/[^/]+\/reset-password$/i.test(path) ||
    /^auth\/users\/[^/]+$/i.test(path)
  );
}

function isAllowedPath(path: string): boolean {
  return (
    /^products(\/|$)/i.test(path) ||
    /^stock(\/|$)/i.test(path) ||
    /^product-categories(\/|$)/i.test(path) ||
    /^cadastros(\/|$)/i.test(path) ||
    /^orders(\/|$)/i.test(path) ||
    /^api\/pedidos(\/|$)/i.test(path) ||
    /^pedidos(\/|$)/i.test(path) ||
    /^dashboard(\/|$)/i.test(path) ||
    /^api\/erp\/dashboard(\/|$)/i.test(path) ||
    /^api\/permissions(\/|$)/i.test(path) ||
    /^permissions(\/|$)/i.test(path) ||
    /^api\/users\/[^/]+\/permissions$/i.test(path) ||
    /^users\/[^/]+\/permissions$/i.test(path) ||
    /^api\/notifications(\/|$)/i.test(path) ||
    /^notifications(\/|$)/i.test(path) ||
    /^api\/chat(\/|$)/i.test(path) ||
    /^chat(\/|$)/i.test(path) ||
    /^api\/financeiro(\/|$)/i.test(path) ||
    /^financeiro(\/|$)/i.test(path) ||
    /^api\/compras(\/|$)/i.test(path) ||
    /^compras(\/|$)/i.test(path) ||
    /^api\/crm(\/|$)/i.test(path) ||
    /^crm(\/|$)/i.test(path) ||
    /^correios(\/|$)/i.test(path) ||
    /^api\/correios(\/|$)/i.test(path) ||
    isAuthPath(path)
  );
}

/** Aceita `/api/erp/pedidos/*` e encaminha para `api/pedidos/*` no Nest. */
function resolveUpstreamPath(segments: string[]): string {
  const path = segments.join('/');
  if (/^pedidos(\/|$)/i.test(path)) {
    return `api/${path}`;
  }
  if (/^dashboard(\/|$)/i.test(path)) {
    return `api/erp/${path}`;
  }
  if (/^users\/[^/]+\/permissions$/i.test(path)) {
    return `api/${path}`;
  }
  if (/^permissions(\/|$)/i.test(path)) {
    return `api/${path}`;
  }
  if (/^notifications(\/|$)/i.test(path)) {
    return `api/${path}`;
  }
  if (/^chat(\/|$)/i.test(path)) {
    return `api/${path}`;
  }
  if (/^financeiro(\/|$)/i.test(path)) {
    return `api/${path}`;
  }
  if (/^compras(\/|$)/i.test(path)) {
    return `api/${path}`;
  }
  if (/^crm(\/|$)/i.test(path)) {
    return `api/${path}`;
  }
  if (/^correios(\/|$)/i.test(path)) {
    return `correios/${path.replace(/^correios\/?/, '')}`;
  }
  return path;
}

async function proxy(request: NextRequest, segments: string[]) {
  const path = resolveUpstreamPath(segments);
  if (!path || !isAllowedPath(path)) {
    return NextResponse.json(
      { message: 'Rota não permitida.' },
      { status: 403 },
    );
  }

  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  if (!token && !isAuthDisabled()) {
    return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 });
  }

  // Em modo bypass (dev), o Nest rejeitaria auth/me sem token — responde com o usuário mock.
  if (/^auth\/me$/i.test(path) && !token && isAuthDisabled()) {
    return NextResponse.json({ user: DEV_MOCK_USER });
  }

  if (/^auth\/users$/i.test(path) && !token && isAuthDisabled()) {
    return NextResponse.json([DEV_MOCK_USER]);
  }

  const target = `${API_BASE_URL}/${path}${request.nextUrl.search}`;
  const method = request.method;
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const incomingCt = request.headers.get('content-type');
  if (incomingCt && method !== 'GET' && method !== 'HEAD') {
    headers.set('content-type', incomingCt);
  }

  const init: RequestInit = {
    method,
    headers,
    cache: 'no-store',
  };

  if (method !== 'GET' && method !== 'HEAD') {
    if (incomingCt?.includes('multipart/form-data')) {
      const body = await request.arrayBuffer();
      if (body.byteLength > 0) {
        init.body = body;
      }
    } else {
      const body = await request.text();
      if (body.length > 0) {
        init.body = body;
        if (!headers.has('content-type')) {
          headers.set('content-type', 'application/json');
        }
      }
    }
  }

  const upstream = await fetch(target, init);
  const outHeaders = new Headers();
  const ct = upstream.headers.get('content-type');
  if (ct) {
    outHeaders.set('content-type', ct);
  }
  const contentDisposition = upstream.headers.get('content-disposition');
  if (contentDisposition) {
    outHeaders.set('content-disposition', contentDisposition);
  }

  const isBinary =
    (ct?.includes('application/pdf') ?? false) ||
    (ct?.includes('application/octet-stream') ?? false) ||
    (ct?.startsWith('image/') ?? false);

  if (isBinary) {
    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: upstream.status,
      headers: outHeaders,
    });
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: outHeaders,
  });
}

type SegmentsCtx = Promise<{ segments: string[] }>;

async function readSegments(params: SegmentsCtx) {
  const p = await params;
  return p.segments ?? [];
}

export async function GET(
  request: NextRequest,
  context: { params: SegmentsCtx },
) {
  return proxy(request, await readSegments(context.params));
}

export async function POST(
  request: NextRequest,
  context: { params: SegmentsCtx },
) {
  return proxy(request, await readSegments(context.params));
}

export async function PATCH(
  request: NextRequest,
  context: { params: SegmentsCtx },
) {
  return proxy(request, await readSegments(context.params));
}

export async function PUT(
  request: NextRequest,
  context: { params: SegmentsCtx },
) {
  return proxy(request, await readSegments(context.params));
}

export async function DELETE(
  request: NextRequest,
  context: { params: SegmentsCtx },
) {
  return proxy(request, await readSegments(context.params));
}
