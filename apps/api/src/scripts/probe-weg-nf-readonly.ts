/**
 * Probe read-only: usa o access token já salvo em ContaAzulSession.
 * Não reconecta e não grava tokens.
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import axios from 'axios';
import { prisma } from '@erp/database';
import { CONTA_AZUL_API_BASE, objectKeys } from '../financeiro/conta-azul.auth';
import { mapContaAzulVenda, vendaWegHint } from '../financeiro/conta-azul.vendas';
import { planNfVinculoAudit } from '../financeiro/conta-azul.nf-vinculo-audit';

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

function payloadItems(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];
  const rec = payload as Record<string, unknown>;
  const list = rec.itens ?? rec.items ?? rec.data;
  return Array.isArray(list)
    ? list.filter(
        (x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object',
      )
    : [];
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
      `${path} HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 500)}`,
    );
  }
  return res.data;
}

async function main(): Promise<void> {
  loadEnvFile();
  const rows = await prisma.$queryRaw<
    Array<{ accessToken: string; expiresAt: Date }>
  >`SELECT "accessToken", "expiresAt" FROM "ContaAzulSession" LIMIT 1`;
  const session = rows[0];
  if (!session?.accessToken) {
    throw new Error('Sem sessão Conta Azul local. Reconecte antes de probear.');
  }
  console.log('Sessão local expiresAt', session.expiresAt);
  const token = session.accessToken;

  const conta = await caGet(token, '/v1/pessoas/conta-conectada');
  console.log(
    'conta-conectada keys',
    objectKeys(conta),
    JSON.stringify(conta).slice(0, 400),
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
      invoiceHistory: { select: { invoiceNumber: true, createdAt: true } },
    },
  });
  console.log('\n=== ERP ===');
  console.log(
    JSON.stringify(
      orders.map((o) => ({
        code: o.code,
        externalOrderNumber: o.externalOrderNumber,
        invoiceNumber: o.invoiceNumber,
        status: o.status,
        contaAzulVendaId: o.contaAzulVendaId,
        history: o.invoiceHistory,
      })),
      null,
      2,
    ),
  );

  const vendaIds = [
    ...new Set(orders.map((o) => o.contaAzulVendaId).filter(Boolean)),
  ] as string[];
  const vendaDetalhes: unknown[] = [];
  const vendasFound: NonNullable<ReturnType<typeof mapContaAzulVenda>>[] = [];
  for (const id of vendaIds) {
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
      codigo_pedido: inner.codigo_pedido ?? null,
      pedido: inner.pedido ?? payload.pedido ?? null,
      mapped,
      wegHint: mapped ? vendaWegHint(mapped) : null,
    });
    if (mapped) vendasFound.push(mapped);
  }

  const buscaAttempts: unknown[] = [];
  for (const numero of ['4517818598', '45178185981', '451781859811', '4519085342']) {
    try {
      const payload = await caGet(token, '/v1/venda/busca', {
        pagina: 1,
        tamanho_pagina: 50,
        numero: Number(numero),
      });
      const itens = payloadItems(payload);
      buscaAttempts.push({
        numero,
        itemCount: itens.length,
        keys: objectKeys(payload),
        sample: itens.slice(0, 3).map((item) => ({
          keys: objectKeys(item),
          id: item.id ?? null,
          numero: item.numero ?? null,
          numero_pedido: item.numero_pedido ?? null,
          pedido: item.pedido ?? null,
        })),
      });
      for (const item of itens) {
        const mapped = mapContaAzulVenda(item);
        if (mapped && !vendasFound.some((v) => v.contaAzulId === mapped.contaAzulId)) {
          vendasFound.push(mapped);
        }
      }
    } catch (err) {
      buscaAttempts.push({
        numero,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const today = new Date();
  const notas: unknown[] = [];
  for (const venda of vendasFound) {
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

  for (const nf of ['1211', '912', '865']) {
    try {
      const payload = await caGet(token, '/v1/notas-fiscais', {
        pagina: 1,
        tamanho_pagina: 50,
        numero_nota: Number(nf),
        data_inicial: ymd(new Date(today.getTime() - 14 * 86400000)),
        data_final: ymd(today),
      });
      notas.push({
        via: 'numero_nota',
        nf,
        keys: objectKeys(payload),
        itens: payloadItems(payload).slice(0, 8).map((item) => ({
          keys: objectKeys(item),
          numero_nota: item.numero_nota ?? item.numero ?? null,
          id_venda: item.id_venda ?? null,
          nome_destinatario: item.nome_destinatario ?? null,
          data_emissao: item.data_emissao ?? null,
        })),
      });
    } catch (err) {
      notas.push({
        via: 'numero_nota',
        nf,
        error: err instanceof Error ? err.message : String(err),
      });
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
    vendas: vendasFound,
  });

  console.log('\n=== vendaDetalhes ===');
  console.log(JSON.stringify(vendaDetalhes, null, 2));
  console.log('\n=== busca por numero ===');
  console.log(JSON.stringify(buscaAttempts, null, 2));
  console.log('\n=== notas ===');
  console.log(JSON.stringify(notas, null, 2));
  console.log('\n=== matching ===');
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
