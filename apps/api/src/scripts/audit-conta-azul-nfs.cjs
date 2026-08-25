/**
 * Cruza NFs do Conta Azul (CSV colado no servidor) com o banco do ERP.
 * Somente leitura — não altera pedido, NF nem estoque.
 *
 * Sem filtro de data: busca Order por externalOrderNumber em qualquer período.
 *
 * Uso (na pasta apps/api, com DATABASE_URL no .env):
 *   node src/scripts/audit-conta-azul-nfs.cjs ./conta-azul-nfs.csv
 *
 * CSV (UTF-8, separador ponto e vírgula):
 *   nf;pedido;sku;quantidade
 *   158392;4518884234;S081049;2
 */

const fs = require('fs');
const path = require('path');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnv(path.join(__dirname, '../../../.env'));
loadEnv(path.join(__dirname, '../../../packages/database/.env'));
loadEnv(path.join(__dirname, '../../.env'));

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Uso: node src/scripts/audit-conta-azul-nfs.cjs <arquivo.csv>');
  console.error('Exemplo: node src/scripts/audit-conta-azul-nfs.cjs ./conta-azul-nfs.csv');
  process.exit(1);
}

const resolvedCsv = path.resolve(process.cwd(), csvPath);
if (!fs.existsSync(resolvedCsv)) {
  console.error('Arquivo CSV não encontrado:', resolvedCsv);
  process.exit(1);
}

function detectSeparator(headerLine) {
  const counts = {
    ';': (headerLine.match(/;/g) || []).length,
    '|': (headerLine.match(/\|/g) || []).length,
    '\t': (headerLine.match(/\t/g) || []).length,
    ',': (headerLine.match(/,/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ';';
}

function parseCsvLine(line, sep) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function normalizeHeader(value) {
  return (value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_');
}

function headerIndex(headers, aliases) {
  for (const alias of aliases) {
    const i = headers.indexOf(alias);
    if (i >= 0) return i;
  }
  return -1;
}

function parseQty(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let n;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    n = Number(s.replace(/\./g, '').replace(',', '.'));
  } else if (/^\d+,\d+$/.test(s)) {
    n = Number(s.replace(',', '.'));
  } else {
    n = Number(s.replace(/\s/g, ''));
  }
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeSku(value) {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeNf(value) {
  return String(value ?? '').trim();
}

function isBlankInvoice(value) {
  const v = String(value ?? '').trim();
  return !v || v === '-' || v.toLowerCase() === 'null';
}

function orderNumberVariants(pedido) {
  const raw = String(pedido ?? '').trim();
  const digits = digitsOnly(raw);
  const set = new Set();
  for (const v of [raw, digits, digits.replace(/^0+/, '') || digits]) {
    if (!v) continue;
    set.add(v);
    set.add(`#${v}`);
    if (/^\d+$/.test(v) && v.length < 10) set.add(v.padStart(10, '0'));
    if (/^\d+$/.test(v) && v.length === 10) set.add(v.replace(/^0+/, '') || v);
  }
  return [...set];
}

function parseCsvFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (lines.length === 0) {
    throw new Error('CSV vazio.');
  }

  const sep = detectSeparator(lines[0]);
  const first = parseCsvLine(lines[0], sep).map(normalizeHeader);
  const looksLikeHeader = first.some((h) =>
    ['nf', 'nota', 'pedido', 'sku', 'quantidade', 'qtd'].includes(h),
  );

  let headers;
  let dataLines;
  if (looksLikeHeader) {
    headers = first;
    dataLines = lines.slice(1);
  } else {
    headers = ['nf', 'pedido', 'sku', 'quantidade'];
    dataLines = lines;
  }

  const iNf = headerIndex(headers, ['nf', 'nota', 'nfe', 'numero_nf', 'invoice', 'nota_fiscal']);
  const iPed = headerIndex(headers, [
    'pedido',
    'pedido_weg',
    'numero_pedido',
    'external',
    'externalordernumber',
  ]);
  const iSku = headerIndex(headers, ['sku', 'codigo', 'produto', 'cod_produto']);
  const iQty = headerIndex(headers, ['quantidade', 'qtd', 'qty', 'qtde', 'qtd_nf']);

  if (iNf < 0 || iPed < 0 || iSku < 0 || iQty < 0) {
    throw new Error(
      `Cabeçalho inválido. Esperado: nf;pedido;sku;quantidade — encontrado: ${headers.join(';')}`,
    );
  }

  const rows = [];
  dataLines.forEach((line, idx) => {
    const cols = parseCsvLine(line, sep);
    const nf = normalizeNf(cols[iNf]);
    const pedido = String(cols[iPed] ?? '').trim();
    const sku = String(cols[iSku] ?? '').trim();
    const quantidade = parseQty(cols[iQty]);
    const lineNo = looksLikeHeader ? idx + 2 : idx + 1;
    if (!nf && !pedido && !sku) return;
    if (!nf || !pedido || !sku || quantidade == null) {
      rows.push({
        lineNo,
        nf,
        pedido,
        sku,
        quantidade,
        invalid: true,
        reason: 'Linha incompleta (nf, pedido, sku ou quantidade inválida)',
      });
      return;
    }
    rows.push({ lineNo, nf, pedido, sku, quantidade, invalid: false });
  });

  return { sep, rows };
}

function collectLinkedInvoices(order) {
  const set = new Set();
  if (!isBlankInvoice(order.invoiceNumber)) set.add(String(order.invoiceNumber).trim());
  for (const h of order.invoiceHistory || []) {
    if (!isBlankInvoice(h.invoiceNumber)) set.add(String(h.invoiceNumber).trim());
  }
  for (const e of order.exits || []) {
    if (!isBlankInvoice(e.invoiceNumber)) set.add(String(e.invoiceNumber).trim());
  }
  return [...set];
}

function nfMatches(linked, csvNf) {
  const csv = normalizeNf(csvNf);
  const csvDigits = digitsOnly(csv);
  return linked.some((n) => {
    if (n === csv) return true;
    const d = digitsOnly(n);
    return Boolean(csvDigits) && d === csvDigits;
  });
}

function skuOnItem(item, sku) {
  const target = normalizeSku(sku);
  const itemSku = normalizeSku(item.sku);
  const productSku = normalizeSku(item.product?.sku);
  return itemSku === target || productSku === target;
}

function pickBestOrder(orders) {
  if (orders.length === 1) return orders[0];
  const rank = (status) => {
    if (status === 'CANCELADO') return 3;
    if (status === 'ARQUIVADO') return 2;
    return 1;
  };
  return [...orders].sort((a, b) => {
    const rs = rank(a.status) - rank(b.status);
    if (rs !== 0) return rs;
    return new Date(b.createdAt) - new Date(a.createdAt);
  })[0];
}

function formatRow(r) {
  const parts = [
    `L${r.lineNo}`,
    `NF ${r.nf || '—'}`,
    `Ped ${r.pedido}`,
    `SKU ${r.sku}`,
    `Qtd NF ${r.quantidade ?? '—'}`,
  ];
  if (r.erp) {
    parts.push(`ERP ${r.erp.code}`);
    parts.push(`status ${r.erp.status}`);
    parts.push(`invoiceNumber ${r.erp.invoiceNumber || '(vazio)'}`);
    parts.push(`invoicedQty ${r.erp.invoicedQty}`);
    parts.push(`pickedQty ${r.erp.pickedQty}`);
    parts.push(`qtdPedida ${r.erp.orderedQty}`);
    if (r.erp.linkedNfs?.length) parts.push(`NFs ERP [${r.erp.linkedNfs.join(', ')}]`);
  }
  if (r.reason) parts.push(`→ ${r.reason}`);
  return parts.join(' | ');
}

(async () => {
  const { rows, sep } = parseCsvFile(resolvedCsv);
  const { prisma } = require('@erp/database');

  console.log('=== Auditoria Conta Azul × ERP (somente leitura) ===');
  console.log(`CSV: ${resolvedCsv}`);
  console.log(`Separador detectado: ${JSON.stringify(sep)}`);
  console.log(`Linhas: ${rows.length}`);
  console.log('Filtro de data: NENHUM\n');

  const valid = rows.filter((r) => !r.invalid);
  const variantsToPedido = new Map();
  for (const r of valid) {
    for (const v of orderNumberVariants(r.pedido)) {
      if (!variantsToPedido.has(v)) variantsToPedido.set(v, new Set());
      variantsToPedido.get(v).add(r.pedido);
    }
  }
  const allVariants = [...variantsToPedido.keys()];

  const orders = allVariants.length
    ? await prisma.order.findMany({
        where: {
          OR: [
            { externalOrderNumber: { in: allVariants } },
            { mercadoEletronicoNumber: { in: allVariants } },
            { code: { in: allVariants } },
          ],
        },
        select: {
          id: true,
          code: true,
          externalOrderNumber: true,
          mercadoEletronicoNumber: true,
          status: true,
          invoiceNumber: true,
          createdAt: true,
          items: {
            select: {
              sku: true,
              quantity: true,
              pickedQty: true,
              invoicedQty: true,
              product: { select: { sku: true } },
            },
          },
          invoiceHistory: { select: { invoiceNumber: true } },
          exits: { select: { invoiceNumber: true } },
        },
      })
    : [];

  const ordersByPedido = new Map();
  const indexOrder = (pedidoKey, order) => {
    if (!ordersByPedido.has(pedidoKey)) ordersByPedido.set(pedidoKey, []);
    const list = ordersByPedido.get(pedidoKey);
    if (!list.some((o) => o.id === order.id)) list.push(order);
  };

  for (const order of orders) {
    const keys = [
      order.externalOrderNumber,
      order.mercadoEletronicoNumber,
      order.code,
    ];
    for (const key of keys) {
      if (!key) continue;
      const pedidos = variantsToPedido.get(String(key).trim());
      if (pedidos) {
        for (const p of pedidos) indexOrder(p, order);
      }
      const digitKey = digitsOnly(key);
      const pedidosByDigits = variantsToPedido.get(digitKey);
      if (pedidosByDigits) {
        for (const p of pedidosByDigits) indexOrder(p, order);
      }
    }
  }

  const ok = [];
  const unlinked = [];
  const missing = [];
  const invalid = rows.filter((r) => r.invalid);

  for (const r of valid) {
    const matches = ordersByPedido.get(r.pedido) || [];
    if (matches.length === 0) {
      missing.push({ ...r, reason: 'Nenhum Order com esse externalOrderNumber (sem filtro de data)' });
      continue;
    }

    const order = pickBestOrder(matches);
    const linkedNfs = collectLinkedInvoices(order);
    const items = order.items.filter((it) => skuOnItem(it, r.sku));
    const invoicedQty = items.reduce((sum, it) => sum + (it.invoicedQty ?? 0), 0);
    const pickedQty = items.reduce((sum, it) => sum + (it.pickedQty ?? 0), 0);
    const orderedQty = items.reduce((sum, it) => sum + (it.quantity ?? 0), 0);
    const hasInvoice = linkedNfs.length > 0;
    const qtyOk = items.length > 0 && invoicedQty >= r.quantidade;
    const thisNfOnOrder = nfMatches(linkedNfs, r.nf);

    const erp = {
      code: order.code,
      status: order.status,
      invoiceNumber: isBlankInvoice(order.invoiceNumber) ? '' : String(order.invoiceNumber).trim(),
      invoicedQty,
      pickedQty,
      orderedQty,
      linkedNfs,
      extraOrders: matches.length > 1 ? matches.length : 0,
    };

    if (qtyOk && thisNfOnOrder) {
      ok.push({
        ...r,
        erp,
        reason: 'Pedido encontrado, esta NF está vinculada e invoicedQty suficiente',
      });
      continue;
    }

    const reasons = [];
    if (items.length === 0) reasons.push(`SKU ${r.sku} não encontrado neste pedido`);
    if (!hasInvoice) reasons.push('invoiceNumber vazio (nem histórico/saída com NF)');
    if (items.length > 0 && invoicedQty < r.quantidade) {
      reasons.push(`invoicedQty ${invoicedQty} < qtd NF ${r.quantidade} (furo de estoque)`);
    }
    if (hasInvoice && !thisNfOnOrder) {
      reasons.push(`NF ${r.nf} não aparece no ERP (NFs: ${linkedNfs.join(', ') || '—'})`);
    }

    unlinked.push({
      ...r,
      erp,
      reason: reasons.join('; ') || 'NF não vinculada',
    });
  }

  const printGroup = (title, list) => {
    console.log(`\n${title}  (${list.length})`);
    console.log('-'.repeat(72));
    if (list.length === 0) {
      console.log('(nenhum)');
      return;
    }
    for (const r of list) console.log(formatRow(r));
  };

  printGroup('✅ OK — pedido existe e quantidade faturada correta', ok);
  printGroup(
    '⚠️  NF não vinculada — candidatos a correção manual (vincular NF + baixa retroativa)',
    unlinked,
  );
  printGroup('❌ Pedido não encontrado no ERP', missing);
  if (invalid.length) printGroup('Linhas inválidas no CSV', invalid);

  console.log('\n=== Resumo ===');
  console.log(`OK:                ${ok.length}`);
  console.log(`NF não vinculada:  ${unlinked.length}`);
  console.log(`Pedido inexistente:${missing.length}`);
  console.log(`CSV inválido:      ${invalid.length}`);
  console.log(`Total linhas:      ${rows.length}`);
  console.log('Nenhuma correção foi aplicada.');

  const outPath = resolvedCsv.replace(/\.csv$/i, '') + '-resultado.txt';
  const outLines = [
    'Auditoria Conta Azul × ERP (somente leitura)',
    `Gerado em: ${new Date().toISOString()}`,
    `CSV: ${resolvedCsv}`,
    '',
    `OK: ${ok.length}`,
    `NF não vinculada: ${unlinked.length}`,
    `Pedido não encontrado: ${missing.length}`,
    '',
    '--- ⚠️ NF NÃO VINCULADA (lista completa) ---',
    unlinked.length ? unlinked.map(formatRow).join('\n') : '(nenhum)',
    '',
    '--- ❌ PEDIDO NÃO ENCONTRADO ---',
    missing.length ? missing.map(formatRow).join('\n') : '(nenhum)',
    '',
  ];
  fs.writeFileSync(outPath, outLines.join('\n'), 'utf8');
  console.log(`\nRelatório gravado em: ${outPath}`);

  await prisma.$disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
