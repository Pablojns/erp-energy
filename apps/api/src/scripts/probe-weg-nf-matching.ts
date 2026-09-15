/**
 * Reconecta a sessão local da Conta Azul (Cognito test user = mesma app OAuth)
 * e sonda GET /v1/venda/busca + /v1/venda/{id} + /v1/notas-fiscais
 * para os pedidos WEG 4517818598 e 4519085342.
 *
 * Não grava vínculo. Uso:
 *   npx ts-node -r tsconfig-paths/register src/scripts/probe-weg-nf-matching.ts
 */
import { createHmac } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import axios from 'axios';
import { prisma } from '@erp/database';
import {
  CONTA_AZUL_API_BASE,
  CONTA_AZUL_SESSION_ID,
  expiryFromExpiresIn,
  objectKeys,
} from '../financeiro/conta-azul.auth';
import { mapContaAzulVenda, vendaWegHint } from '../financeiro/conta-azul.vendas';
import { planNfVinculoAudit } from '../financeiro/conta-azul.nf-vinculo-audit';
import { invoiceNumberDigits } from '../orders/order-search';

const SPOTLIGHT = ['4517818598', '4519085342'];

function loadEnvFile(): void {
  const candidates = [
    resolve(__dirname, '../../../.env'),
    resolve(__dirname, '../../.env'),
  ];
  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    try {
      const content = readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
      }
    } catch {
      /* ignore */
    }
  }
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function cognitoLogin(): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}> {
  const clientId = process.env.CONTA_AZUL_CLIENT_ID ?? '';
  const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET ?? '';
  const username = process.env.CONTA_AZUL_TEST_USER ?? '';
  const password = process.env.CONTA_AZUL_TEST_PASSWORD ?? '';
  if (!clientId || !clientSecret || !username || !password) {
    throw new Error('Credenciais CONTA_AZUL_* ausentes no .env');
  }
  const secretHash = createHmac('sha256', clientSecret)
    .update(username + clientId)
    .digest('base64');
  const res = await axios.post(
    'https://cognito-idp.sa-east-1.amazonaws.com/',
    {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
        SECRET_HASH: secretHash,
      },
    },
    {
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      timeout: 20_000,
      validateStatus: () => true,
    },
  );
  const data = res.data as {
    AuthenticationResult?: {
      AccessToken?: string;
      RefreshToken?: string;
      TokenType?: string;
      ExpiresIn?: number;
    };
    message?: string;
    __type?: string;
  };
  const auth = data.AuthenticationResult;
  if (!auth?.AccessToken) {
    throw new Error(
      `Cognito falhou: ${data.__type ?? ''} ${data.message ?? JSON.stringify(data).slice(0, 300)}`,
    );
  }
  return {
    access_token: auth.AccessToken,
    refresh_token: auth.RefreshToken,
    token_type: auth.TokenType,
    expires_in: auth.ExpiresIn,
  };
}

async function caGet(
  token: string,
  path: string,
  params?: Record<string, string | number>,
): Promise<unknown> {
  const res = await axios.get(`${CONTA_AZUL_API_BASE}${path}`, {
    params,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30_000,
    validateStatus: () => true,
  });
  if (res.status >= 400) {
    throw new Error(
      `${path} HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 400)}`,
    );
  }
  return res.data;
}

function payloadItems(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];
  const rec = payload as Record<string, unknown>;
  const list = rec.itens ?? rec.items ?? rec.data;
  return Array.isArray(list)
    ? list.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
    : [];
}

async function main(): Promise<void> {
  loadEnvFile();
  const db = process.env.DATABASE_URL ?? '';
  console.log('DB:', db.replace(/:[^:@/]+@/, ':***@'));
  console.log('Reconectando Conta Azul via Cognito (pode rotacionar o refresh de produção)...');
  const tokens = await cognitoLogin();
  const expiresAt = expiryFromExpiresIn(tokens.expires_in);
  await prisma.$executeRaw`
    INSERT INTO "ContaAzulSession" ("id", "accessToken", "refreshToken", "tokenType", "expiresAt", "createdAt", "updatedAt")
    VALUES (
      ${CONTA_AZUL_SESSION_ID},
      ${tokens.access_token},
      ${tokens.refresh_token ?? ''},
      ${tokens.token_type ?? 'Bearer'},
      ${expiresAt},
      NOW(),
      NOW()
    )
    ON CONFLICT ("id") DO UPDATE SET
      "accessToken" = EXCLUDED."accessToken",
      "refreshToken" = EXCLUDED."refreshToken",
      "tokenType" = EXCLUDED."tokenType",
      "expiresAt" = EXCLUDED."expiresAt",
      "updatedAt" = EXCLUDED."updatedAt"
  `;
  const token = tokens.access_token;
  console.log('Sessão persistida. Expira', expiresAt.toISOString());

  const conta = await caGet(token, '/v1/pessoas/conta-conectada');
  console.log(
    'conta-conectada:',
    JSON.stringify(
      typeof conta === 'object' && conta
        ? {
            keys: objectKeys(conta),
            ...(conta as Record<string, unknown>),
          }
        : conta,
    ).slice(0, 800),
  );

  const orders = await prisma.order.findMany({
    where: {
      OR: SPOTLIGHT.flatMap((n) => [
        { externalOrderNumber: n },
        { externalOrderNumber: { startsWith: n } },
      ]),
    },
    select: {
      id: true,
      code: true,
      externalOrderNumber: true,
      invoiceNumber: true,
      notaRemessa: true,
      status: true,
      contaAzulVendaId: true,
      totalValue: true,
      orderDate: true,
      invoiceHistory: {
        select: { invoiceNumber: true, createdAt: true },
      },
      items: {
        select: {
          lineNumber: true,
          quantity: true,
          pickedQty: true,
          missingQty: true,
          invoicedQty: true,
        },
      },
    },
  });
  console.log('\n=== ERP (banco conectado) ===');
  console.log(JSON.stringify(orders, null, 2));

  const buscaAttempts: unknown[] = [];
  const vendasFound: ReturnType<typeof mapContaAzulVenda>[] = [];
  for (const numero of SPOTLIGHT) {
    const variants = [...new Set([numero, `${numero}1`, `${numero}11`])];
    for (const variant of variants) {
      for (const params of [
        { pagina: 1, tamanho_pagina: 50, numero: Number(variant) || variant },
        { pagina: 1, tamanho_pagina: 50, numero_pedido: variant },
        { pagina: 1, tamanho_pagina: 50, pesquisa: variant },
      ] as Array<Record<string, string | number>>) {
        try {
          const payload = await caGet(token, '/v1/venda/busca', params);
          const itens = payloadItems(payload);
          buscaAttempts.push({
            variant,
            params,
            itemCount: itens.length,
            keys: objectKeys(payload),
            sample: itens.slice(0, 2).map((item) => ({
              keys: objectKeys(item),
              numero: item.numero ?? null,
              numero_pedido: item.numero_pedido ?? null,
              codigo_pedido: item.codigo_pedido ?? null,
              pedido: item.pedido ?? null,
            })),
          });
          for (const item of itens) {
            const mapped = mapContaAzulVenda(item);
            if (
              mapped &&
              !vendasFound.some((v) => v?.contaAzulId === mapped.contaAzulId)
            ) {
              vendasFound.push(mapped);
            }
          }
        } catch (err) {
          buscaAttempts.push({
            variant,
            params,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  const vendaIds = [
    ...new Set(
      [
        ...orders.map((o) => o.contaAzulVendaId),
        ...vendasFound.map((v) => v?.contaAzulId),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const vendaDetalhes: unknown[] = [];
  for (const id of vendaIds) {
    try {
      const payload = (await caGet(token, `/v1/venda/${id}`)) as Record<
        string,
        unknown
      >;
      const inner =
        payload.venda && typeof payload.venda === 'object'
          ? (payload.venda as Record<string, unknown>)
          : payload;
      const mapped = mapContaAzulVenda(inner);
      vendaDetalhes.push({
        id,
        keys: objectKeys(payload),
        innerKeys: objectKeys(inner),
        numero: inner.numero ?? payload.numero ?? null,
        numero_pedido: inner.numero_pedido ?? null,
        pedido: inner.pedido ?? payload.pedido ?? null,
        mapped,
        wegHint: mapped ? vendaWegHint(mapped) : null,
      });
      if (
        mapped &&
        !vendasFound.some((v) => v?.contaAzulId === mapped.contaAzulId)
      ) {
        vendasFound.push(mapped);
      }
    } catch (err) {
      vendaDetalhes.push({
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const today = new Date();
  const notas: unknown[] = [];
  for (const venda of vendasFound) {
    if (!venda) continue;
    const around = venda.data ? new Date(venda.data) : today;
    const start = new Date(around);
    start.setUTCDate(start.getUTCDate() - 7);
    const end = new Date(around);
    end.setUTCDate(end.getUTCDate() + 7);
    try {
      const payload = await caGet(token, '/v1/notas-fiscais', {
        pagina: 1,
        tamanho_pagina: 50,
        data_inicial: ymd(start),
        data_final: ymd(end),
        id_venda: venda.contaAzulId,
      });
      notas.push({
        via: 'id_venda',
        vendaId: venda.contaAzulId,
        vendaNumero: venda.numero,
        vendaNumeroPedido: venda.numeroPedido,
        wegHint: vendaWegHint(venda),
        keys: objectKeys(payload),
        itens: payloadItems(payload).map((item) => ({
          keys: objectKeys(item),
          numero_nota: item.numero_nota ?? item.numero ?? null,
          id_venda: item.id_venda ?? null,
          chave_acesso: item.chave_acesso ?? null,
          status: item.status ?? null,
        })),
      });
    } catch (err) {
      notas.push({
        via: 'id_venda',
        vendaId: venda.contaAzulId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const order of orders) {
    const seen = new Set<string>();
    for (const raw of [
      order.invoiceNumber,
      ...order.invoiceHistory.map((h) => h.invoiceNumber),
    ]) {
      const digits = invoiceNumberDigits(String(raw ?? ''));
      if (!digits || seen.has(digits)) continue;
      seen.add(digits);
      try {
        const payload = await caGet(token, '/v1/notas-fiscais', {
          pagina: 1,
          tamanho_pagina: 50,
          numero_nota: Number(digits) || digits,
          data_inicial: ymd(new Date(today.getTime() - 14 * 86400000)),
          data_final: ymd(today),
        });
        notas.push({
          via: 'numero_nota',
          pedido: order.externalOrderNumber,
          nf: digits,
          keys: objectKeys(payload),
          itens: payloadItems(payload).slice(0, 8).map((item) => ({
            keys: objectKeys(item),
            numero_nota: item.numero_nota ?? item.numero ?? null,
            id_venda: item.id_venda ?? null,
            nome_destinatario: item.nome_destinatario ?? null,
          })),
        });
      } catch (err) {
        notas.push({
          via: 'numero_nota',
          nf: digits,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const audit = planNfVinculoAudit({
    orders: orders.map((o) => ({
      id: o.id,
      code: o.code,
      externalOrderNumber: o.externalOrderNumber,
      invoiceNumber: o.invoiceNumber,
      notaRemessa: o.notaRemessa,
      status: String(o.status),
      contaAzulVendaId: o.contaAzulVendaId,
      history: o.invoiceHistory,
    })),
    vendas: vendasFound.filter((v): v is NonNullable<typeof v> => Boolean(v)),
  });

  console.log('\n=== buscaAttempts ===');
  console.log(JSON.stringify(buscaAttempts, null, 2));
  console.log('\n=== vendaDetalhes ===');
  console.log(JSON.stringify(vendaDetalhes, null, 2));
  console.log('\n=== notas ===');
  console.log(JSON.stringify(notas, null, 2));
  console.log('\n=== matching corrigido (spotlight) ===');
  console.log(JSON.stringify(audit, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
