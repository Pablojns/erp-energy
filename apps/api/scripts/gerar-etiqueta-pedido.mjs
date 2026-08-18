/**
 * Gera etiqueta Correios para o pedido 13355053 (ou argv[2]) direto no backend.
 * Uso em produção:
 *   cd /var/www/erp-energy/apps/api && node scripts/gerar-etiqueta-pedido.mjs 13355053
 */
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.resolve(__dirname, '../../../.env');
const apiEnv = path.resolve(__dirname, '../.env');
for (const envPath of [rootEnv, apiEnv]) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const numeroPed = (process.argv[2] || '13355053').trim();
const usuario = process.env.CORREIOS_USUARIO;
const senha = process.env.CORREIOS_SENHA_COMPONENTE;
const cartao = process.env.CORREIOS_CARTAO_POSTAGEM;
const base =
  (process.env.CORREIOS_ENV || 'producao') === 'producao'
    ? 'https://api.correios.com.br'
    : 'https://apihom.correios.com.br';
const cred = Buffer.from(`${usuario}:${senha}`).toString('base64');

function formatText(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeNome(nome) {
  const cleaned = formatText(nome).slice(0, 50);
  const letters = cleaned.replace(/[^A-Za-z]/g, '');
  return letters.length >= 2 ? cleaned : 'Destinatario';
}

function parseAddress(raw) {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.v === 1 || parsed.logradouro || parsed.cep) {
      const cep = String(parsed.cep ?? '').replace(/\D/g, '');
      if (cep.length !== 8) return null;
      return {
        cep,
        logradouro: String(parsed.logradouro ?? '').trim(),
        numero: String(parsed.numero ?? '').trim() || 'S/N',
        complemento: String(parsed.complemento ?? '').trim(),
        bairro: String(parsed.bairro ?? '').trim() || 'Centro',
        cidade: String(parsed.cidade ?? '').trim(),
        uf: String(parsed.uf ?? '').trim().toUpperCase(),
      };
    }
  } catch {
    /* free text */
  }

  const addressRaw = raw.trim();
  const cepMatch = addressRaw.match(/CEP\s*([\d.-]+)/i);
  const cep = cepMatch?.[1]?.replace(/\D/g, '') ?? '';
  if (cep.length !== 8) return null;
  const withoutCep = addressRaw.replace(/\s*[-–—]?\s*CEP\s*[\d.-]+/i, '').trim();
  const segments = withoutCep
    .split(/\s*[-–—]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  let cidade = '';
  let uf = '';
  if (segments.length) {
    const last = segments[segments.length - 1];
    const m = last.match(/^(.+)\s*\/\s*([A-Za-z]{2})$/);
    if (m) {
      cidade = m[1].trim();
      uf = m[2].trim().toUpperCase();
      segments.pop();
    }
  }
  let logradouro = '';
  let numero = 'S/N';
  let complemento = '';
  let bairro = '';
  if (segments[0]) {
    const parts = segments[0]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    logradouro = parts[0] ?? '';
    if (parts.length >= 2) numero = parts[parts.length - 1] || 'S/N';
  }
  if (segments.length >= 3) {
    complemento = segments[1] ?? '';
    bairro = segments.slice(2).join(' - ');
  } else if (segments[1]) {
    bairro = segments[1];
  }
  if (!logradouro || !cidade || !uf) return null;
  return {
    cep,
    logradouro,
    numero,
    complemento,
    bairro: bairro || 'Centro',
    cidade,
    uf,
  };
}

function ensureBairro(end) {
  let bairro = formatText(end.bairro);
  let complemento = formatText(end.complemento);
  if (!bairro) {
    if (complemento) {
      bairro = complemento.slice(0, 30);
      complemento = '';
    } else {
      bairro = formatText(end.cidade || 'Centro').slice(0, 30);
    }
  }
  return {
    cep: end.cep.replace(/\D/g, ''),
    logradouro: formatText(end.logradouro).slice(0, 50),
    numero: String(end.numero || 'S/N').trim().slice(0, 6) || 'S/N',
    complemento: complemento.slice(0, 30),
    bairro: bairro.slice(0, 30),
    cidade: formatText(end.cidade).slice(0, 30),
    uf: end.uf.toUpperCase().slice(0, 2),
    regiao: formatText(
      {
        MG: 'Minas Gerais',
        PR: 'Parana',
        SP: 'Sao Paulo',
      }[end.uf.toUpperCase()] || end.uf,
    ),
  };
}

const prisma = new PrismaClient();

try {
  const order = await prisma.order.findFirst({
    where: {
      OR: [{ externalOrderNumber: numeroPed }, { code: numeroPed }],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      carrier: { select: { name: true } },
      items: { select: { description: true, sku: true }, take: 5 },
    },
  });
  if (!order) {
    console.error('ORDER_NOT_FOUND', numeroPed);
    process.exit(1);
  }

  console.log('ORDER', {
    id: order.id,
    source: order.source,
    customerName: order.customerName,
    receiverName: order.receiverName,
    deliveryAddress: order.deliveryAddress,
    unloadingPoint: order.unloadingPoint,
    carrier: order.carrier?.name,
    trackingCode: order.trackingCode,
  });

  const carrier = (order.carrier?.name || '').toUpperCase();
  let codigoServico = process.env.CORREIOS_CODIGO_PAC || '03298';
  if (carrier.includes('MINI ENVIOS'))
    codigoServico = process.env.CORREIOS_CODIGO_MINI_ENVIOS || '04227';
  else if (carrier.includes('SEDEX'))
    codigoServico = process.env.CORREIOS_CODIGO_SEDEX || '03220';
  else if (carrier.includes('PAC'))
    codigoServico = process.env.CORREIOS_CODIGO_PAC || '03298';
  else {
    console.error('CARRIER_UNSUPPORTED', order.carrier?.name);
    process.exit(1);
  }

  const nome =
    order.source === 'SITE'
      ? order.customerName || order.receiverName || 'Destinatario'
      : order.receiverName || order.customerName || 'Destinatario';

  const addr =
    parseAddress(order.deliveryAddress) || parseAddress(order.unloadingPoint);
  if (!addr) {
    console.error('ADDRESS_PARSE_FAIL');
    process.exit(1);
  }

  const auth = await axios.post(
    `${base}/token/v1/autentica/cartaopostagem`,
    { numero: cartao },
    {
      headers: {
        Authorization: `Basic ${cred}`,
        'Content-Type': 'application/json',
      },
    },
  );
  const token = auth.data.token;

  const cepOrig = (process.env.CORREIOS_CEP_ORIGEM || '86057170').replace(
    /\D/g,
    '',
  );
  const cepOrigData = await axios.get(`${base}/cep/v1/enderecos/${cepOrig}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const destEnd = ensureBairro(addr);
  const body = {
    remetente: {
      nome: 'Energy Brands',
      cpfCnpj: String(usuario).replace(/\D/g, ''),
      endereco: {
        cep: cepOrig,
        logradouro: formatText(
          cepOrigData.data?.logradouro || cepOrigData.data?.end || 'Rua',
        ),
        numero: 'S/N',
        complemento: '',
        bairro: formatText(cepOrigData.data?.bairro || 'Centro'),
        cidade: formatText(
          cepOrigData.data?.localidade ||
            cepOrigData.data?.cidade ||
            'Londrina',
        ),
        uf: cepOrigData.data?.uf || 'PR',
      },
      telefone: '',
      email: '',
    },
    destinatario: {
      nome: sanitizeNome(nome),
      cpfCnpj:
        (order.deliveryCnpj || order.customerDocument || '').replace(
          /\D/g,
          '',
        ) || '',
      endereco: destEnd,
      telefone: '',
      email: '',
    },
    codigoServico,
    pesoInformado: '300',
    codigoFormatoObjetoInformado: '2',
    alturaInformada: '2',
    larguraInformada: '11',
    comprimentoInformado: '16',
    modalidadePagamento: '2',
    numeroNotaFiscal: '0',
    emiteDCe: 'S',
    cienteObjetoNaoProibido: '1',
    itensDeclaracaoConteudo: [
      {
        conteudo: formatText(
          order.items
            .map((i) => i.description || i.sku)
            .filter(Boolean)
            .join(', ')
            .slice(0, 200) || 'Mercadorias',
        ),
        quantidade: '1',
        valor: '10.00',
      },
    ],
  };

  console.log('PAYLOAD', JSON.stringify(body, null, 2));

  const pp = await axios.post(`${base}/prepostagem/v1/prepostagens`, body, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  console.log('CREATE', {
    id: pp.data?.id,
    codigoObjeto: pp.data?.codigoObjeto,
    statusAtual: pp.data?.statusAtual,
    descStatusAtual: pp.data?.descStatusAtual,
  });

  const id = pp.data?.id;
  let ready = false;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, i === 0 ? 500 : 2000));
    const consulta = await axios.get(`${base}/prepostagem/v2/prepostagens`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { id },
    });
    const item = consulta.data?.itens?.[0];
    console.log('POLL', i, item?.statusAtual, item?.descStatusAtual);
    if (item?.statusAtual === 2) {
      ready = true;
      break;
    }
    if (item?.statusAtual === 5 || /cancelad/i.test(item?.descStatusAtual || '')) {
      console.error('CANCELLED', item?.descStatusAtual);
      process.exit(1);
    }
  }
  if (!ready) {
    console.error('NOT_READY');
    process.exit(1);
  }

  const lote = await axios.post(
    `${base}/prepostagem/v1/prepostagens/rotulo/assincrono/pdf`,
    { idsPrePostagem: [id], tipoRotulo: 'P', formatoRotulo: 'ET' },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const idRecibo = lote.data?.idRecibo ?? lote.data?.id;
  console.log('ROTULO_RECIBO', idRecibo);

  let pdfBuf = null;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, i === 0 ? 500 : 2000));
    const pdf = await axios.get(
      `${base}/prepostagem/v1/prepostagens/rotulo/download/assincrono/${idRecibo}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'arraybuffer',
        validateStatus: () => true,
      },
    );
    const ct = String(pdf.headers['content-type'] || '');
    if (pdf.status === 200 && ct.includes('pdf')) {
      pdfBuf = Buffer.from(pdf.data);
      break;
    }
    console.log('ROTULO_WAIT', i, pdf.status, ct.slice(0, 40));
  }
  if (!pdfBuf) {
    console.error('PDF_FAIL');
    process.exit(1);
  }

  const out = path.resolve(
    __dirname,
    `../../etiqueta-${numeroPed}-${pp.data.codigoObjeto}.pdf`,
  );
  fs.writeFileSync(out, pdfBuf);
  console.log('PDF_OK', out, pdfBuf.length);

  const codigoRastreio = String(pp.data.codigoObjeto || '').trim();
  if (codigoRastreio) {
    await prisma.order.update({
      where: { id: order.id },
      data: { trackingCode: codigoRastreio },
    });
    console.log('TRACKING_SAVED', codigoRastreio);
  }
} catch (e) {
  console.error(
    'FATAL',
    e.response?.status,
    JSON.stringify(e.response?.data ?? e.message, null, 2),
  );
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
