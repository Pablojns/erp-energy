import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      const key = l.slice(0, i).trim();
      let val = l.slice(i + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      return [key, val];
    }),
);

const usuario = env.CORREIOS_USUARIO;
const senha = env.CORREIOS_SENHA_COMPONENTE;
const cartao = env.CORREIOS_CARTAO_POSTAGEM;
const contrato = env.CORREIOS_CONTRATO;
const envName = env.CORREIOS_ENV || 'homologacao';
const base =
  envName === 'producao'
    ? 'https://api.correios.com.br'
    : 'https://apihom.correios.com.br';
const cred = Buffer.from(`${usuario}:${senha}`).toString('base64');

async function testEnv(label, baseUrl) {
  console.log(`\n=== ${label} (${baseUrl}) ===`);
  try {
    const auth = await axios.post(
      `${baseUrl}/token/v1/autentica/cartaopostagem`,
      { numero: cartao },
      {
        headers: {
          Authorization: `Basic ${cred}`,
          'Content-Type': 'application/json',
        },
      },
    );
    console.log('AUTH_OK expiraEm:', auth.data.expiraEm);
    console.log('APIs no cartao:', auth.data?.cartaoPostagem?.api ?? auth.data?.api);
    const token = auth.data.token;

    const cep = await axios.get(`${baseUrl}/cep/v1/enderecos/86057170`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log('CEP_OK:', cep.data?.logradouro ?? cep.data?.end, cep.data?.localidade, cep.data?.uf);
    await listStatuses(baseUrl, token);

    const prepostBody = {
      remetente: {
        nome: 'Energy Brands',
        cpfCnpj: usuario,
        endereco: {
          cep: '86057170',
          logradouro: cep.data?.logradouro ?? cep.data?.end ?? 'Rua Teste',
          numero: '100',
          complemento: '',
          bairro: cep.data?.bairro ?? 'Centro',
          cidade: cep.data?.localidade ?? cep.data?.cidade ?? 'Londrina',
          uf: cep.data?.uf ?? 'PR',
        },
      },
      destinatario: {
        nome: 'Teste Destinatario',
        cpfCnpj: '52998224725',
        endereco: {
          cep: '01310100',
          logradouro: 'Avenida Paulista',
          numero: '1000',
          complemento: '',
          bairro: 'Bela Vista',
          cidade: 'Sao Paulo',
          regiao: 'Sao Paulo',
          uf: 'SP',
        },
      },
      codigoServico: '03220',
      pesoInformado: '300',
      codigoFormatoObjetoInformado: '2',
      alturaInformada: '2',
      larguraInformada: '11',
      comprimentoInformado: '16',
      modalidadePagamento: '2',
      numeroNotaFiscal: '1234',
      emiteDCe: 'N',
      cienteObjetoNaoProibido: '1',
      itensDeclaracaoConteudo: [
        { conteudo: 'Mercadorias teste', quantidade: '1', valor: '10.00' },
      ],
    };

    try {
      const pp = await axios.post(
        `${baseUrl}/prepostagem/v1/prepostagens`,
        prepostBody,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
      );
      console.log('PREPOSTAGEM_FULL', JSON.stringify(pp.data));

      const id = pp.data?.id;
      const codigoObjeto = pp.data?.codigoObjeto;
      if (id) {
        for (let wait = 0; wait < 15; wait++) {
          const consulta = await axios.get(
            `${baseUrl}/prepostagem/v2/prepostagens?id=${encodeURIComponent(id)}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const item = consulta.data?.itens?.[0] ?? consulta.data?.content?.[0];
          console.log('CONSULTA', wait, item?.statusAtual, item?.descStatusAtual);
          if (item?.descStatusAtual && item.descStatusAtual !== 'Pendente') break;
          await new Promise((r) => setTimeout(r, 3000));
        }

        const rotuloBody = codigoObjeto
          ? { codigosObjeto: [codigoObjeto], tipoRotulo: 'P', formatoRotulo: 'ET' }
          : { idsPrePostagem: [id], tipoRotulo: 'P', formatoRotulo: 'ET' };
        const lote = await axios.post(
          `${baseUrl}/prepostagem/v1/prepostagens/rotulo/assincrono/pdf`,
          rotuloBody,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        console.log('ROTULO_RESP', JSON.stringify(lote.data));
        const idRecibo = lote.data?.idRecibo ?? lote.data?.id;
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const pdf = await axios.get(
              `${baseUrl}/prepostagem/v1/prepostagens/rotulo/download/assincrono/${idRecibo}`,
              { headers: { Authorization: `Bearer ${token}` }, responseType: 'arraybuffer', validateStatus: () => true },
            );
            if (pdf.status === 200 && pdf.headers['content-type']?.includes('pdf')) {
              console.log('PDF_OK bytes', pdf.data.byteLength);
              break;
            }
            const body = pdf.data?.byteLength ? Buffer.from(pdf.data).toString('utf8') : '';
            console.log('ROTULO_STATUS', i, pdf.status, body.slice(0, 200));
          } catch (pollErr) {
            console.log('ROTULO_POLL_ERR', i, pollErr.response?.status, JSON.stringify(pollErr.response?.data));
          }
        }
      }
    } catch (e) {
      console.log(
        'PREPOSTAGEM_ERR',
        e.response?.status,
        JSON.stringify(e.response?.data ?? e.message),
      );
    }
  } catch (e) {
    console.log('ERR', e.response?.status, JSON.stringify(e.response?.data ?? e.message));
  }
}

async function listStatuses(baseUrl, token) {
  for (const st of ['PREPOSTADO', 'PENDENTE', 'PREATENDIDO']) {
    const r = await axios.get(
      `${baseUrl}/prepostagem/v2/prepostagens?status=${st}&tipoObjeto=REGISTRADO&size=2`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const items = r.data?.itens ?? r.data?.content ?? [];
    console.log('LIST', st, items.length, items[0]?.descStatusAtual, items[0]?.statusAtual);
  }
}

async function testRotuloForPrePostado(baseUrl, token) {
  const r = await axios.get(
    `${baseUrl}/prepostagem/v2/prepostagens?status=PREPOSTADO&tipoObjeto=REGISTRADO&size=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const item = (r.data?.itens ?? r.data?.content ?? [])[0];
  if (!item?.id) {
    console.log('NO_PREPOSTADO_ITEM');
    return;
  }
  console.log('TEST_ROTULO_ITEM', item.id, item.codigoObjeto, item.descStatusAtual);
  const lote = await axios.post(
    `${baseUrl}/prepostagem/v1/prepostagens/rotulo/assincrono/pdf`,
    { idsPrePostagem: [item.id], tipoRotulo: 'P', formatoRotulo: 'ET' },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const idRecibo = lote.data?.idRecibo ?? lote.data?.id;
  console.log('ROTULO_RECIBO', idRecibo);
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pdf = await axios.get(
      `${baseUrl}/prepostagem/v1/prepostagens/rotulo/download/assincrono/${idRecibo}`,
      { headers: { Authorization: `Bearer ${token}` }, responseType: 'arraybuffer', validateStatus: () => true },
    );
    const ct = pdf.headers['content-type'] ?? '';
    if (pdf.status === 200 && ct.includes('pdf')) {
      console.log('PDF_OK bytes', pdf.data.byteLength);
      return;
    }
    const body = pdf.data?.byteLength ? Buffer.from(pdf.data).toString('utf8').slice(0, 300) : '';
    console.log('ROTULO_STATUS', i, pdf.status, ct, body);
  }
}

const prodBase = 'https://api.correios.com.br';
const auth = await axios.post(
  `${prodBase}/token/v1/autentica/cartaopostagem`,
  { numero: cartao },
  { headers: { Authorization: `Basic ${cred}`, 'Content-Type': 'application/json' } },
);
await testRotuloForPrePostado(prodBase, auth.data.token);
// await testEnv('producao', prodBase);
