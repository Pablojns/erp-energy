import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const API_URL = 'http://localhost:3001';
const ESTOQUE_PATH  = 'C:\\Users\\SUNHUB\\Downloads\\CONTROLE DE ESTOQUE.xlsx';
const PRECOS_PATH   = 'C:\\Users\\SUNHUB\\Downloads\\PREÇO DE VENDA WEG CONTRATO.xlsx';
const LOGIN_EMAIL   = 'admin2@erp.local';
const LOGIN_SENHA   = 'admin123';

function normalizeSku(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return String(Math.round(raw));
  return String(raw).trim();
}

function normalizeText(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

function toDecimal(v) {
  if (v === null || v === undefined) return '0.00';
  const n = Number(v);
  if (!isFinite(n)) return '0.00';
  return n.toFixed(2);
}

async function login() {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_SENHA }),
  });
  if (!res.ok) throw new Error(`Login falhou: ${res.status}`);
  const data = await res.json();
  return data.accessToken;
}

async function upsertProduto(token, produto) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const busca = await fetch(`${API_URL}/products?search=${encodeURIComponent(produto.sku)}&pageSize=1`, { headers });
  const buscaData = await busca.json();
  const existing = buscaData?.data?.find(p => p.sku === produto.sku);
  if (existing) {
    const res = await fetch(`${API_URL}/products/${existing.id}`, {
      method: 'PATCH', headers, body: JSON.stringify(produto),
    });
    return { action: 'atualizado', ok: res.ok, status: res.status };
  } else {
    const res = await fetch(`${API_URL}/products`, {
      method: 'POST', headers, body: JSON.stringify(produto),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { action: 'criado', ok: false, status: res.status, body: txt };
    }
    return { action: 'criado', ok: true, status: res.status };
  }
}

async function main() {
  for (const p of [ESTOQUE_PATH, PRECOS_PATH]) {
    if (!existsSync(p)) {
      console.error(`Arquivo não encontrado: ${p}`);
      process.exit(1);
    }
  }

  console.log('Lendo planilhas...');
  const XLSX = await import('xlsx').catch(() => null);
  if (!XLSX) { console.error('xlsx não instalado'); process.exit(1); }
  const { read, utils } = XLSX.default ?? XLSX;

  const estoqueBuffer = await readFile(ESTOQUE_PATH);
  const wbEstoque = read(estoqueBuffer, { type: 'buffer', cellDates: true });
  const wsEstoque = wbEstoque.Sheets['CADA_PROD'];
  const rowsEstoque = utils.sheet_to_json(wsEstoque, { defval: null, blankrows: false, range: 4 });

  const precosBuffer = await readFile(PRECOS_PATH);
  const wbPrecos = read(precosBuffer, { type: 'buffer' });
  const wsPrecos = wbPrecos.Sheets[wbPrecos.SheetNames[0]];
  const rowsPrecos = utils.sheet_to_json(wsPrecos, {
    header: ['sku','nome','preco'], defval: null, blankrows: false,
  });

  const precoMap = new Map();
  for (const r of rowsPrecos) {
    const sku = normalizeSku(r.sku);
    if (sku && r.preco != null) precoMap.set(sku, Number(r.preco));
  }

  console.log(`Estoque: ${rowsEstoque.length} linhas | Preços: ${precoMap.size} SKUs`);

  const produtos = [];
  for (const r of rowsEstoque) {
    const sku = normalizeSku(r['__EMPTY_1']);
    const nome = normalizeText(r['Nome do produto']);
    const estoqueMin = r['Estoque mínimo'];
    const custo = r['Custo unitário de Primeira Entrada'];
    const fornecedor = r['Fornecedor'];

    if (!sku || !nome) continue;

    const preco = precoMap.get(sku) ?? 0;
    const internalCode = `WEG-${sku}`;

    produtos.push({
      internalCode,
      sku,
      name: nome,
      description: normalizeText(fornecedor) ?? '',
      price: toDecimal(preco),
      cost: toDecimal(custo),
      minStock: Math.round(Number(estoqueMin) || 0),
      category: normalizeText(fornecedor) ?? undefined,
    });
  }

  console.log(`${produtos.length} produtos válidos para importar.`);
  console.log('Primeiro produto:', JSON.stringify(produtos[0]));
  console.log('Autenticando...');
  const token = await login();
  console.log('Autenticado. Iniciando importação...\n');

  let criados = 0, atualizados = 0, erros = 0;

  for (let i = 0; i < produtos.length; i++) {
    const p = produtos[i];
    try {
      const result = await upsertProduto(token, p);
      if (result.ok) {
        if (result.action === 'criado') criados++;
        else atualizados++;
        if ((criados + atualizados) % 10 === 0) {
          process.stdout.write(`\r  ${criados + atualizados}/${produtos.length} processados...`);
        }
      } else {
        erros++;
        if (erros <= 3) console.error(`\nErro ${p.sku} (${result.status}): ${result.body}`);
      }
    } catch (e) {
      erros++;
      if (erros <= 3) console.error(`\nErro ${p.sku}: ${e.message}`);
    }
  }

  console.log(`\n\nConcluído!`);
  console.log(`  Criados:    ${criados}`);
  console.log(`  Atualizados: ${atualizados}`);
  console.log(`  Erros:      ${erros}`);
}

main().catch(e => { console.error('Falha:', e.message); process.exit(1); });
