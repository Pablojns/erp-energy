/**
 * Cruza NFs do Conta Azul (CSV) com o ERP e, opcionalmente, aplica correção retroativa.
 *
 * Sem filtro de data. Não altera os já OK nem pedidos não encontrados.
 *
 * Uso (pasta apps/api, DATABASE_URL no .env):
 *   node src/scripts/audit-conta-azul-nfs.cjs ./conta-azul-nfs.csv
 *   node src/scripts/audit-conta-azul-nfs.cjs ./conta-azul-nfs.csv --dry-run
 *   node src/scripts/audit-conta-azul-nfs.cjs ./conta-azul-nfs.csv --apply
 *
 * CSV (UTF-8, separador ;). Coluna data é opcional (DD/MM/YYYY ou YYYY-MM-DD):
 *   nf;pedido;sku;quantidade
 *   nf;pedido;sku;quantidade;data
 */

const fs = require('fs');
const path = require('path');

const AUDIT_TAG = 'audit-conta-azul-nfs';

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

function parseArgs(argv) {
  const flags = new Set();
  const files = [];
  for (const a of argv) {
    if (a.startsWith('--')) flags.add(a);
    else files.push(a);
  }
  return {
    csvPath: files[0] || null,
    dryRun: flags.has('--dry-run'),
    apply: flags.has('--apply'),
    flags,
  };
}

function printUsage() {
  console.error('Uso:');
  console.error('  node src/scripts/audit-conta-azul-nfs.cjs <arquivo.csv>');
  console.error('  node src/scripts/audit-conta-azul-nfs.cjs <arquivo.csv> --dry-run');
  console.error('  node src/scripts/audit-conta-azul-nfs.cjs <arquivo.csv> --apply');
}

const args = parseArgs(process.argv.slice(2));
if (!args.csvPath) {
  printUsage();
  process.exit(1);
}
if (args.apply && args.dryRun) {
  console.error('Use só --dry-run ou só --apply, não os dois juntos.');
  process.exit(1);
}

const resolvedCsv = path.resolve(process.cwd(), args.csvPath);
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

function parseNfDate(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let y;
  let m;
  let d;
  const br = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  const iso = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (br) {
    d = Number(br[1]);
    m = Number(br[2]);
    y = Number(br[3]);
  } else if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
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
  const iDate = headerIndex(headers, ['data', 'data_nf', 'emissao', 'dt_nf', 'date']);

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
    const nfDate = iDate >= 0 ? parseNfDate(cols[iDate]) : null;
    const lineNo = looksLikeHeader ? idx + 2 : idx + 1;
    if (!nf && !pedido && !sku) return;
    if (!nf || !pedido || !sku || quantidade == null) {
      rows.push({
        lineNo,
        nf,
        pedido,
        sku,
        quantidade,
        nfDate,
        invalid: true,
        reason: 'Linha incompleta (nf, pedido, sku ou quantidade inválida)',
      });
      return;
    }
    rows.push({ lineNo, nf, pedido, sku, quantidade, nfDate, invalid: false });
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

function toNumber(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value);
}

function isoDate(d) {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().slice(0, 10);
}

function isSkuNotFound(row) {
  return String(row.reason || '').includes('não encontrado neste pedido');
}

async function classify(prisma, rows) {
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
          invoiceStatus: true,
          orderDate: true,
          createdAt: true,
          totalValue: true,
          carrier: { select: { name: true } },
          items: {
            select: {
              id: true,
              sku: true,
              lineNumber: true,
              quantity: true,
              pickedQty: true,
              invoicedQty: true,
              reservedQuantity: true,
              productId: true,
              unitPrice: true,
              product: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  stockQty: true,
                  reservedQty: true,
                },
              },
            },
          },
          invoiceHistory: { select: { id: true, invoiceNumber: true } },
          exits: { select: { id: true, invoiceNumber: true, exitDate: true } },
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
      missing.push({
        ...r,
        reason: 'Nenhum Order com esse externalOrderNumber (sem filtro de data)',
      });
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
      orderId: order.id,
      code: order.code,
      status: order.status,
      invoiceNumber: isBlankInvoice(order.invoiceNumber)
        ? ''
        : String(order.invoiceNumber).trim(),
      invoicedQty,
      pickedQty,
      orderedQty,
      linkedNfs,
      extraOrders: matches.length > 1 ? matches.length : 0,
    };

    if (qtyOk && thisNfOnOrder) {
      ok.push({
        ...r,
        order,
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
      order,
      items,
      erp,
      reason: reasons.join('; ') || 'NF não vinculada',
    });
  }

  return { ok, unlinked, missing, invalid };
}

function resolveExitDate(order, nfDate) {
  if (nfDate) return { date: nfDate, source: 'CSV data da NF' };
  if (order.orderDate) return { date: new Date(order.orderDate), source: 'Order.orderDate (CSV sem data)' };
  return { date: new Date(order.createdAt), source: 'Order.createdAt (CSV sem data)' };
}

function buildPlan(unlinked) {
  const skuNotFound = unlinked.filter(isSkuNotFound);
  const cancelled = [];
  const candidates = [];
  for (const r of unlinked) {
    if (isSkuNotFound(r)) continue;
    if (r.order?.status === 'CANCELADO') {
      cancelled.push({ ...r, reason: 'Pedido CANCELADO — não aplica correção automática' });
      continue;
    }
    candidates.push(r);
  }

  const byOrder = new Map();
  for (const r of candidates) {
    const order = r.order;
    if (!byOrder.has(order.id)) {
      byOrder.set(order.id, { order, rows: [] });
    }
    byOrder.get(order.id).rows.push(r);
  }

  const plans = [];
  for (const { order, rows } of byOrder.values()) {
    const linked = collectLinkedInvoices(order);
    const nfMap = new Map();
    for (const r of rows) {
      const key = normalizeNf(r.nf);
      if (!nfMap.has(key)) {
        nfMap.set(key, { nf: key, csvQty: 0, date: r.nfDate, rows: [] });
      }
      const entry = nfMap.get(key);
      entry.csvQty += r.quantidade;
      if (!entry.date && r.nfDate) entry.date = r.nfDate;
      entry.rows.push(r);
    }

    const nfs = [];
    const headerBlank = isBlankInvoice(order.invoiceNumber);
    let headerWillSet = null;
    for (const entry of nfMap.values()) {
      const alreadyHeader =
        !headerBlank && nfMatches([String(order.invoiceNumber).trim()], entry.nf);
      const alreadyHistory = nfMatches(
        (order.invoiceHistory || []).map((h) => h.invoiceNumber),
        entry.nf,
      );
      const alreadyExit = (order.exits || []).some((e) =>
        nfMatches([e.invoiceNumber], entry.nf),
      );
      let action = 'noop';
      if (alreadyHeader || alreadyHistory) {
        action = 'already-linked';
      } else if (headerBlank && !headerWillSet) {
        action = 'set-header';
        headerWillSet = entry.nf;
      } else {
        action = 'history';
      }
      const resolved = resolveExitDate(order, entry.date);
      nfs.push({
        nf: entry.nf,
        csvQty: entry.csvQty,
        alreadyHeader,
        alreadyHistory,
        alreadyExit,
        action,
        exitDate: resolved.date,
        exitDateSource: resolved.source,
      });
    }

    const skuMap = new Map();
    for (const r of rows) {
      const sku = normalizeSku(r.sku);
      if (!skuMap.has(sku)) {
        const items = order.items
          .filter((it) => skuOnItem(it, r.sku))
          .sort((a, b) => a.lineNumber - b.lineNumber);
        skuMap.set(sku, { sku: r.sku, items, csvQty: 0, nfs: new Map() });
      }
      const g = skuMap.get(sku);
      g.csvQty += r.quantidade;
      const nfKey = normalizeNf(r.nf);
      g.nfs.set(nfKey, (g.nfs.get(nfKey) || 0) + r.quantidade);
    }

    const itemPlans = [];
    for (const g of skuMap.values()) {
      const invoicedBefore = g.items.reduce((s, it) => s + (it.invoicedQty ?? 0), 0);
      const orderedQty = g.items.reduce((s, it) => s + (it.quantity ?? 0), 0);
      const pickedQty = g.items.reduce((s, it) => s + (it.pickedQty ?? 0), 0);
      const product = g.items.find((it) => it.product)?.product || null;
      const productId = g.items.find((it) => it.productId)?.productId || product?.id || null;
      const target = Math.max(invoicedBefore, Math.min(orderedQty, g.csvQty));
      const qtyOut = Math.max(0, target - invoicedBefore);
      const unitPrice = toNumber(g.items[0]?.unitPrice);
      const stockBefore = product?.stockQty ?? null;
      const reservedBefore = product?.reservedQty ?? 0;
      const decReserved = Math.min(reservedBefore, qtyOut);
      const stockAfter = stockBefore == null ? null : stockBefore - qtyOut;
      const reservedAfter = reservedBefore - decReserved;
      const allocations = [];
      let remaining = qtyOut;
      for (const it of g.items) {
        const room = Math.max(0, it.quantity - (it.invoicedQty ?? 0));
        const take = Math.min(room, remaining);
        const invoicedAfter = (it.invoicedQty ?? 0) + take;
        const pickedFinal = (it.pickedQty ?? 0) > 0 ? it.pickedQty : invoicedAfter;
        allocations.push({
          itemId: it.id,
          lineNumber: it.lineNumber,
          invoicedBefore: it.invoicedQty ?? 0,
          invoicedAfter,
          pickedFinal,
          missingQty: Math.max(0, it.quantity - pickedFinal),
          reservedQuantityAfter: Math.max(0, (it.reservedQuantity ?? 0) - Math.min(it.reservedQuantity ?? 0, take)),
          take,
        });
        remaining -= take;
      }
      itemPlans.push({
        sku: g.sku,
        productId,
        productSku: product?.sku || g.sku,
        productName: product?.name || '',
        stockBefore,
        stockAfter,
        reservedBefore,
        reservedAfter,
        decReserved,
        orderedQty,
        pickedQty,
        invoicedBefore,
        csvQty: g.csvQty,
        invoicedAfter: target,
        qtyOut,
        unitPrice,
        nfs: [...g.nfs.entries()].map(([nf, qty]) => ({ nf, qty })),
        allocations,
        warnNegative: stockAfter != null && stockAfter < 0,
        warnOverOrder: g.csvQty > orderedQty,
        warnNoProduct: !productId,
        leftoverUnallocated: remaining,
      });
    }

    const fullyAfter = order.items.every((it) => {
      const planned = itemPlans
        .flatMap((p) => p.allocations)
        .find((a) => a.itemId === it.id);
      const invoiced = planned ? planned.invoicedAfter : it.invoicedQty ?? 0;
      return it.quantity <= 0 || invoiced >= it.quantity;
    });
    let newStatus = order.status;
    if (order.status !== 'CANCELADO') {
      newStatus = fullyAfter ? 'FINALIZADO' : 'PARCIAL';
    }

    plans.push({
      orderId: order.id,
      code: order.code,
      pedido: rows[0].pedido,
      status: order.status,
      newStatus,
      currentInvoice: isBlankInvoice(order.invoiceNumber)
        ? ''
        : String(order.invoiceNumber).trim(),
      carrierName: order.carrier?.name ?? null,
      totalValue: toNumber(order.totalValue),
      rowCount: rows.length,
      nfs,
      items: itemPlans,
    });
  }

  return { skuNotFound, cancelled, plans };
}

function printPlan(planBundle) {
  const { skuNotFound, cancelled, plans } = planBundle;
  console.log('\n=== PLANO DE CORREÇÃO RETROATIVA ===');
  console.log(`Pedidos a corrigir: ${plans.length}`);
  console.log(`Linhas SKU não encontrado (não aplica): ${skuNotFound.length}`);
  console.log(`Pedidos CANCELADO (não aplica): ${cancelled.length}`);

  if (skuNotFound.length) {
    console.log('\n--- SKU NÃO ENCONTRADO NO PEDIDO (revisão manual) ---');
    for (const r of skuNotFound) console.log(formatRow(r));
  }
  if (cancelled.length) {
    console.log('\n--- CANCELADO (não aplica) ---');
    for (const r of cancelled) console.log(formatRow(r));
  }

  let totalQtyOut = 0;
  let totalNeg = 0;
  let totalNoProduct = 0;
  for (const p of plans) {
    console.log(`\nPedido ${p.pedido}  ERP ${p.code}  ${p.status} → ${p.newStatus}`);
    console.log(`  invoiceNumber atual: ${p.currentInvoice || '(vazio)'}`);
    for (const nf of p.nfs) {
      console.log(
        `  NF ${nf.nf}: ${nf.action} | OrderExit ${nf.alreadyExit ? 'já existe' : 'criar'} | data ${isoDate(nf.exitDate)} (${nf.exitDateSource})`,
      );
    }
    for (const it of p.items) {
      totalQtyOut += it.qtyOut;
      if (it.warnNegative) totalNeg += 1;
      if (it.warnNoProduct) totalNoProduct += 1;
      const flags = [
        it.warnNoProduct ? 'SEM PRODUTO' : null,
        it.warnNegative ? 'ESTOQUE FICARIA NEGATIVO' : null,
        it.warnOverOrder ? `CSV ${it.csvQty} > qtd pedida ${it.orderedQty}` : null,
      ]
        .filter(Boolean)
        .join(' | ');
      console.log(
        `  SKU ${it.sku}  produto ${it.productSku || '—'} ${it.productName ? `(${it.productName})` : ''}`,
      );
      console.log(
        `    invoicedQty ${it.invoicedBefore} → ${it.invoicedAfter}  |  CSV ${it.csvQty}  |  baixa estoque ${it.qtyOut}`,
      );
      console.log(
        `    stockQty ${it.stockBefore ?? '—'} → ${it.stockAfter ?? '—'}  |  reservedQty ${it.reservedBefore} → ${it.reservedAfter}`,
      );
      if (flags) console.log(`    AVISO: ${flags}`);
    }
  }

  console.log('\n=== Totais do plano ===');
  console.log(`Unidades a descontar do estoque: ${totalQtyOut}`);
  console.log(`Itens sem productId (NF vincula, estoque não baixa): ${totalNoProduct}`);
  console.log(`Itens com estoque resultante negativo: ${totalNeg}`);
}

async function existingAuditMovements(tx, orderCode, productId) {
  return tx.stockMovement.findMany({
    where: {
      productId,
      movementType: 'SAIDA_EXPEDICAO',
      reference: orderCode,
      notes: { contains: AUDIT_TAG },
    },
    select: { id: true, quantity: true, invoiceNumber: true },
  });
}

async function ensureInvoiceHistory(tx, orderId, invoiceNumber, pickedQtyAtTime) {
  const exists = await tx.orderInvoiceHistory.findFirst({
    where: { orderId, invoiceNumber },
    select: { id: true },
  });
  if (exists) return false;
  await tx.orderInvoiceHistory.create({
    data: {
      orderId,
      invoiceNumber,
      pickedQtyAtTime,
      createdBy: AUDIT_TAG,
    },
  });
  return true;
}

async function applyPlan(prisma, planBundle) {
  const results = {
    orders: 0,
    nfsHeader: 0,
    nfsHistory: 0,
    itemsUpdated: 0,
    stockMoved: 0,
    exitsCreated: 0,
    skipped: 0,
    errors: [],
  };

  for (const plan of planBundle.plans) {
    try {
      await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: plan.orderId },
          select: {
            id: true,
            code: true,
            status: true,
            invoiceNumber: true,
          },
        });
        if (!order) throw new Error('Pedido sumiu durante o apply');
        if (order.status === 'CANCELADO') {
          results.skipped += 1;
          return;
        }

        const headerBlank = isBlankInvoice(order.invoiceNumber);
        const pickedQtyAtTime = plan.items.reduce((s, it) => s + it.pickedQty, 0);
        const nfDate = plan.nfs[0]?.exitDate || undefined;

        const orderUpdate = {
          invoiceStatus: 'INVOICED',
          status: plan.newStatus,
        };
        if (headerBlank) {
          const headerNf = plan.nfs.find((n) => n.action === 'set-header') || plan.nfs[0];
          if (headerNf) {
            orderUpdate.invoiceNumber = headerNf.nf;
            orderUpdate.invoicedAt = headerNf.exitDate;
            results.nfsHeader += 1;
          }
        }
        if (plan.items.some((it) => it.qtyOut > 0)) {
          orderUpdate.shippedAt = nfDate;
        }

        await tx.order.update({
          where: { id: plan.orderId },
          data: orderUpdate,
        });

        for (const nf of plan.nfs) {
          const created = await ensureInvoiceHistory(
            tx,
            plan.orderId,
            nf.nf,
            pickedQtyAtTime,
          );
          if (created && nf.action === 'history') results.nfsHistory += 1;
        }

        for (const it of plan.items) {
          for (const alloc of it.allocations) {
            if (alloc.take <= 0 && alloc.invoicedAfter === alloc.invoicedBefore) continue;
            await tx.orderItem.update({
              where: { id: alloc.itemId },
              data: {
                invoicedQty: alloc.invoicedAfter,
                pickedQty: alloc.pickedFinal,
                missingQty: alloc.missingQty,
                reservedQuantity: alloc.reservedQuantityAfter,
                ...(it.productId ? { productId: it.productId } : {}),
              },
            });
            results.itemsUpdated += 1;
          }

          if (it.qtyOut <= 0) continue;
          if (!it.productId) {
            results.skipped += 1;
            continue;
          }

          const existing = await existingAuditMovements(tx, plan.code, it.productId);
          const alreadyQty = existing.reduce((s, m) => s + m.quantity, 0);
          const moveQty = Math.max(0, it.qtyOut - alreadyQty);
          if (moveQty <= 0) continue;

          const product = await tx.product.findUnique({
            where: { id: it.productId },
            select: { reservedQty: true },
          });
          const decReserved = Math.min(product?.reservedQty ?? 0, it.decReserved, moveQty);
          const nfs = it.nfs.map((n) => n.nf);
          const primaryNf = nfs[0] || plan.nfs[0]?.nf || null;

          await tx.product.update({
            where: { id: it.productId },
            data: {
              stockQty: { decrement: moveQty },
              ...(decReserved > 0 ? { reservedQty: { decrement: decReserved } } : {}),
            },
          });
          await tx.stockMovement.create({
            data: {
              productId: it.productId,
              movementType: 'SAIDA_EXPEDICAO',
              quantity: moveQty,
              reference: plan.code,
              invoiceNumber: primaryNf,
              notes: `Saída retroativa ${AUDIT_TAG} · pedido ${plan.code} · NF ${nfs.join(', ')}`,
              movementDate: nfDate,
            },
          });
          results.stockMoved += moveQty;

          const reservations = await tx.stockReservation.findMany({
            where: {
              orderItemId: { in: it.allocations.map((a) => a.itemId) },
              releasedAt: null,
            },
          });
          let left = decReserved;
          for (const res of reservations) {
            if (left <= 0) break;
            const take = Math.min(res.quantity, left);
            const remaining = res.quantity - take;
            if (remaining <= 0) {
              await tx.stockReservation.update({
                where: { id: res.id },
                data: { releasedAt: nfDate || new Date(), quantity: 0 },
              });
            } else {
              await tx.stockReservation.update({
                where: { id: res.id },
                data: { quantity: remaining },
              });
            }
            left -= take;
          }
        }

        for (const nf of plan.nfs) {
          const exists = await tx.orderExit.findFirst({
            where: { orderId: plan.orderId, invoiceNumber: nf.nf },
            select: { id: true },
          });
          if (exists) continue;
          const nfItems = plan.items.filter((it) => it.nfs.some((n) => n.nf === nf.nf));
          const value = nfItems.reduce((s, it) => {
            const q = it.nfs.find((n) => n.nf === nf.nf)?.qty || 0;
            return s + it.unitPrice * q;
          }, 0);
          await tx.orderExit.create({
            data: {
              orderId: plan.orderId,
              invoiceNumber: nf.nf,
              invoiceValue: value > 0 ? value : plan.totalValue || 0,
              exitDate: nf.exitDate,
              carrierName: plan.carrierName,
            },
          });
          results.exitsCreated += 1;
        }
      });
      results.orders += 1;
    } catch (err) {
      results.errors.push(`${plan.code} / ${plan.pedido}: ${err.message || err}`);
      console.error(`Falha no pedido ${plan.pedido} (${plan.code}):`, err.message || err);
    }
  }

  return results;
}

(async () => {
  const { rows, sep } = parseCsvFile(resolvedCsv);
  const { prisma } = require('@erp/database');

  const mode = args.apply ? 'APPLY' : args.dryRun ? 'DRY-RUN' : 'AUDIT';
  console.log(`=== Auditoria Conta Azul × ERP (${mode}) ===`);
  console.log(`CSV: ${resolvedCsv}`);
  console.log(`Separador detectado: ${JSON.stringify(sep)}`);
  console.log(`Linhas: ${rows.length}`);
  console.log('Filtro de data: NENHUM\n');

  const { ok, unlinked, missing, invalid } = await classify(prisma, rows);

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
    '⚠️  NF não vinculada — candidatos a correção (vincular NF + baixa retroativa)',
    unlinked,
  );
  printGroup('❌ Pedido não encontrado no ERP', missing);
  if (invalid.length) printGroup('Linhas inválidas no CSV', invalid);

  console.log('\n=== Resumo da auditoria ===');
  console.log(`OK:                ${ok.length}`);
  console.log(`NF não vinculada:  ${unlinked.length}`);
  console.log(`Pedido inexistente:${missing.length}`);
  console.log(`CSV inválido:      ${invalid.length}`);
  console.log(`Total linhas:      ${rows.length}`);

  const outPath = resolvedCsv.replace(/\.csv$/i, '') + '-resultado.txt';
  fs.writeFileSync(
    outPath,
    [
      `Auditoria Conta Azul × ERP (${mode})`,
      `Gerado em: ${new Date().toISOString()}`,
      `CSV: ${resolvedCsv}`,
      '',
      `OK: ${ok.length}`,
      `NF não vinculada: ${unlinked.length}`,
      `Pedido não encontrado: ${missing.length}`,
      '',
      '--- ⚠️ NF NÃO VINCULADA ---',
      unlinked.length ? unlinked.map(formatRow).join('\n') : '(nenhum)',
      '',
      '--- ❌ PEDIDO NÃO ENCONTRADO ---',
      missing.length ? missing.map(formatRow).join('\n') : '(nenhum)',
      '',
    ].join('\n'),
    'utf8',
  );
  console.log(`Relatório gravado em: ${outPath}`);

  if (!args.dryRun && !args.apply) {
    console.log('\nNenhuma correção foi aplicada. Para ver o plano:');
    console.log(`  node src/scripts/audit-conta-azul-nfs.cjs ${args.csvPath} --dry-run`);
    await prisma.$disconnect();
    return;
  }

  const planBundle = buildPlan(unlinked);
  printPlan(planBundle);

  const planPath = resolvedCsv.replace(/\.csv$/i, '') + '-dry-run.txt';
  const planLines = [];
  planLines.push(`Plano ${mode} — ${new Date().toISOString()}`);
  planLines.push(`CSV: ${resolvedCsv}`);
  planLines.push(`OK ignorados: ${ok.length}`);
  planLines.push(`Não encontrados ignorados: ${missing.length}`);
  planLines.push(`SKU não encontrado (não aplica): ${planBundle.skuNotFound.length}`);
  planLines.push('');
  for (const r of planBundle.skuNotFound) planLines.push(`SKIP SKU ${formatRow(r)}`);
  for (const p of planBundle.plans) {
    planLines.push('');
    planLines.push(`PEDIDO ${p.pedido} ${p.code} ${p.status}→${p.newStatus}`);
    for (const nf of p.nfs) {
      planLines.push(
        `  NF ${nf.nf} ${nf.action} exit=${nf.alreadyExit ? 'exists' : 'create'} date=${isoDate(nf.exitDate)}`,
      );
    }
    for (const it of p.items) {
      planLines.push(
        `  SKU ${it.sku} invoiced ${it.invoicedBefore}→${it.invoicedAfter} stock ${it.stockBefore}→${it.stockAfter} baixa ${it.qtyOut}`,
      );
    }
  }
  fs.writeFileSync(planPath, planLines.join('\n'), 'utf8');
  console.log(`\nPlano gravado em: ${planPath}`);

  if (args.dryRun) {
    console.log('\nDRY-RUN: nada foi gravado no banco.');
    console.log('Se o plano estiver certo:');
    console.log(`  node src/scripts/audit-conta-azul-nfs.cjs ${args.csvPath} --apply`);
    await prisma.$disconnect();
    return;
  }

  console.log('\n*** APPLY: gravando correção retroativa ***\n');
  const results = await applyPlan(prisma, planBundle);
  console.log('\n=== Resultado do apply ===');
  console.log(`Pedidos atualizados:     ${results.orders}`);
  console.log(`NF no cabeçalho:         ${results.nfsHeader}`);
  console.log(`NF no histórico:         ${results.nfsHistory}`);
  console.log(`Itens invoicedQty:       ${results.itemsUpdated}`);
  console.log(`Unidades baixadas:       ${results.stockMoved}`);
  console.log(`OrderExit criados:       ${results.exitsCreated}`);
  console.log(`Itens/pedidos pulados:   ${results.skipped}`);
  if (results.errors.length) {
    console.log('Erros:');
    for (const e of results.errors) console.log(`  ${e}`);
  }

  await prisma.$disconnect();
  if (results.errors.length) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
