import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = 'https://api-v2.contaazul.com';

function loadEnv(filePath, into) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    into[key] = val;
  }
}

const env = {};
loadEnv(path.join(__dirname, '..', '..', '..', '.env'), env);
loadEnv(path.join(__dirname, '..', '.env'), env);

const clientId = env.CONTA_AZUL_CLIENT_ID?.trim();
const clientSecret = env.CONTA_AZUL_CLIENT_SECRET?.trim();
const username = env.CONTA_AZUL_TEST_USER?.trim();
const password = env.CONTA_AZUL_TEST_PASSWORD?.trim();

if (!clientId || !clientSecret || !username || !password) {
  console.error('Faltam CONTA_AZUL_CLIENT_ID/SECRET ou CONTA_AZUL_TEST_USER/PASSWORD.');
  process.exit(1);
}

function secretHash(user) {
  return crypto
    .createHmac('sha256', clientSecret)
    .update(user + clientId)
    .digest('base64');
}

function firstItem(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const list = payload.itens ?? payload.items ?? payload.data;
  if (Array.isArray(list) && list.length) return list[0];
  return null;
}

function asId(value) {
  if (!value || typeof value !== 'object') return null;
  for (const key of ['id', 'uuid', 'id_venda']) {
    const v = value[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function clip(value, max = 900) {
  try {
    const raw = JSON.stringify(value);
    return raw.length <= max ? value : { truncated: true, preview: raw.slice(0, max) };
  } catch {
    return null;
  }
}

async function cognitoLogin() {
  const res = await fetch('https://cognito-idp.sa-east-1.amazonaws.com/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
        SECRET_HASH: secretHash(username),
      },
    }),
  });
  const data = await res.json();
  const token = data?.AuthenticationResult?.AccessToken;
  if (!token) {
    throw new Error(
      `Cognito não devolveu AccessToken: ${JSON.stringify(data).slice(0, 400)}`,
    );
  }
  return token;
}

async function call(token, method, path, { params, body } = {}) {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text.slice(0, 400);
  }
  return { method, path, status: res.status, ok: res.ok, body: parsed };
}

function ymd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

const report = {
  ambiente: 'teste',
  probedAt: new Date().toISOString(),
  lookups: {},
  createVenda: null,
  vendaCriada: null,
  emissionAttempts: [],
  deleted: null,
  conclusion: {},
};

try {
  const token = await cognitoLogin();
  const today = ymd();

  const pessoas = await call(token, 'GET', '/v1/pessoas', {
    params: { pagina: 1, tamanho_pagina: 20 },
  });
  const produtos = await call(token, 'GET', '/v1/produtos', {
    params: { pagina: 1, tamanho_pagina: 20, status: 'ATIVO' },
  });
  const contas = await call(token, 'GET', '/v1/conta-financeira', {
    params: { pagina: 1, tamanho_pagina: 20, apenas_ativo: true },
  });
  const categorias = await call(token, 'GET', '/v1/categorias', {
    params: { pagina: 1, tamanho_pagina: 50, permite_apenas_filhos: false },
  });
  const proximo = await call(token, 'GET', '/v1/venda/proximo-numero');
  const vendedores = await call(token, 'GET', '/v1/venda/vendedores');
  const servicos = await call(token, 'GET', '/v1/servicos', {
    params: { pagina: 1, tamanho_pagina: 10 },
  });

  const summarize = (row) => ({
    path: row.path,
    status: row.status,
    ok: row.ok,
    keys: row.body && typeof row.body === 'object' ? Object.keys(row.body) : [],
    firstItemKeys: Object.keys(firstItem(row.body) || {}),
    error: row.ok ? undefined : clip(row.body, 400),
  });

  report.lookups = {
    pessoas: summarize(pessoas),
    produtos: summarize(produtos),
    contasFinanceiras: summarize(contas),
    categorias: summarize(categorias),
    proximoNumero: { path: proximo.path, status: proximo.status, body: proximo.body },
    vendedores: summarize(vendedores),
    servicos: summarize(servicos),
  };

  const cliente = firstItem(pessoas.body);
  const produto = firstItem(produtos.body);
  const conta = firstItem(contas.body);
  const categoria = firstItem(categorias.body);
  const clienteId = asId(cliente);
  const produtoId = asId(produto);
  const produtoValor =
    Number(produto?.valor_venda ?? produto?.estoque?.valor_venda ?? 10) || 10;
  const numero =
    typeof proximo.body === 'number'
      ? proximo.body
      : Number(proximo.body?.numero ?? Date.now() % 1_000_000);

  if (!clienteId || !produtoId) {
    report.createVenda = {
      ok: false,
      error: 'Sem cliente ou produto na conta de teste',
      hasCliente: Boolean(clienteId),
      hasProduto: Boolean(produtoId),
    };
  } else {
    const payload = {
      id_cliente: clienteId,
      numero,
      situacao: 'EM_ANDAMENTO',
      data_venda: today,
      observacoes: 'ERP-ENERGY probe emissão NF (conta de teste)',
      itens: [
        {
          id: produtoId,
          descricao: 'Probe emissão NF',
          quantidade: 1,
          valor: produtoValor,
        },
      ],
      condicao_pagamento: {
        tipo_pagamento: 'SEM_PAGAMENTO',
        opcao_condicao_pagamento: 'À vista',
        parcelas: [
          {
            data_vencimento: today,
            valor: produtoValor,
            descricao: 'Parcela 1',
          },
        ],
      },
    };
    if (asId(categoria)) payload.id_categoria = asId(categoria);
    if (asId(conta)) payload.condicao_pagamento.id_conta_financeira = asId(conta);

    let created = await call(token, 'POST', '/v1/venda', { body: payload });
    if (!created.ok) {
      const alt = structuredClone(payload);
      alt.situacao = 'APROVADO';
      alt.condicao_pagamento.tipo_pagamento = 'DINHEIRO';
      created = await call(token, 'POST', '/v1/venda', { body: alt });
      created.retriedWith = { situacao: 'APROVADO', tipo_pagamento: 'DINHEIRO' };
    }
    report.createVenda = {
      status: created.status,
      ok: created.ok,
      body: clip(created.body),
      retriedWith: created.retriedWith,
      request: {
        id_cliente: payload.id_cliente,
        numero: payload.numero,
        situacao: payload.situacao,
        itemId: produtoId,
        valor: produtoValor,
        tipo_pagamento: payload.condicao_pagamento.tipo_pagamento,
      },
    };

    const vendaId = asId(created.body);
    if (vendaId) {
      report.vendaCriada = await call(token, 'GET', `/v1/venda/${vendaId}`);
      report.vendaCriada.body = clip(report.vendaCriada.body);

      const emitPaths = [
        '/v1/notas-fiscais',
        '/v1/notas-fiscais-servico',
        '/v1/notas-fiscais/emitir',
        '/v1/notas-fiscais-servico/emitir',
        `/v1/venda/${vendaId}/emitir`,
        `/v1/venda/${vendaId}/nota-fiscal`,
        `/v1/venda/${vendaId}/nfe`,
        `/v1/venda/${vendaId}/nfse`,
        `/v1/venda/${vendaId}/emitir-nfe`,
        `/v1/venda/${vendaId}/emitir-nfse`,
        `/v1/venda/${vendaId}/rascunho-nfe`,
        '/v1/nfe',
        '/v1/nfse',
      ];
      for (const p of emitPaths) {
        const row = await call(token, 'POST', p, { body: { id_venda: vendaId } });
        report.emissionAttempts.push({
          method: 'POST',
          path: p,
          status: row.status,
          ok: row.ok,
          body: clip(row.body, 500),
        });
      }

      report.deleted = await call(token, 'POST', '/v1/venda/exclusao-lote', {
        body: { ids: [vendaId] },
      });
      report.deleted.body = clip(report.deleted.body);
    } else {
      const emitPaths = [
        '/v1/notas-fiscais',
        '/v1/notas-fiscais-servico',
        '/v1/notas-fiscais/emitir',
      ];
      for (const p of emitPaths) {
        const row = await call(token, 'POST', p, {
          body: { id_venda: '00000000-0000-0000-0000-000000000000' },
        });
        report.emissionAttempts.push({
          method: 'POST',
          path: p,
          status: row.status,
          ok: row.ok,
          body: clip(row.body, 500),
        });
      }
    }
  }

  report.conclusion = {
    canCreateSale: Boolean(report.createVenda?.ok),
    canEmitInvoice: report.emissionAttempts.some((r) => r.ok),
    emissionStatuses: Object.fromEntries(
      report.emissionAttempts.map((r) => [r.path, r.status]),
    ),
  };
} catch (err) {
  report.fatal = err instanceof Error ? err.message : String(err);
}

console.log(JSON.stringify(report, null, 2));
