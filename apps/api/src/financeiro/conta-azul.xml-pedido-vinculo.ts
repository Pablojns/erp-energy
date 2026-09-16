import { documentDigits } from './conta-azul.pessoas';
import {
  extractXmlPedidoNumber,
  findExactOrdersByPedido,
  normalizePedidoDigits,
  type NfeXmlDados,
  type XmlPedidoVia,
} from './conta-azul.nfe-xml';
import {
  isInternalEnergyBrandsSale,
  isWegDestinatario,
  toAddPatch,
  type ItemAddPatch,
  type ProductRef,
} from './conta-azul.vendas-xml';
import type { CaVenda } from './conta-azul.vendas';

export type XmlPedidoOrder = {
  id: string;
  code: string;
  externalOrderNumber: string | null;
  invoiceNumber: string | null;
  notaRemessa?: string | null;
  customerName: string;
  customerDocument: string | null;
  deliveryCnpj: string | null;
  deliveryAddress: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  receiverName: string | null;
  unloadingPoint: string | null;
  contaAzulVendaId: string | null;
  status: string;
};

export type XmlPedidoVendaRow = {
  venda: CaVenda;
  xml: NfeXmlDados | null;
  xmlError: string | null;
};

export type XmlPedidoVinculoPreview = {
  vendaId: string;
  vendaNumero: string | null;
  vendaTotal: number;
  clienteNome: string | null;
  cnpj: string | null;
  orderId: string;
  orderCode: string;
  externalOrderNumber: string | null;
  invoiceNumber: string | null;
  xmlPedido: string;
  via: XmlPedidoVia;
  reason: XmlPedidoVia;
  preencherInvoice: boolean;
  fromOrderId: string | null;
  fromOrderCode: string | null;
  reatribuir: boolean;
};

export type WegParcelaPreview = {
  vendaId: string;
  vendaNumero: string | null;
  xmlPedido: string;
  via: XmlPedidoVia;
  invoiceNumber: string;
  clienteNome: string | null;
  destNome: string | null;
  cnpj: string | null;
  itens: number;
  total: number;
  familyBaseOrderCode: string | null;
  familyBaseOrderId: string | null;
  items: ItemAddPatch[];
  destEnderecoJson: string | null;
  destCidade: string | null;
  destUf: string | null;
  emitidaEm: string | null;
  customerId: string | null;
  unlinkFromOrderId: string | null;
  unlinkFromOrderCode: string | null;
};

export type XmlPedidoSkip = {
  vendaId: string;
  vendaNumero: string | null;
  vendaTotal: number;
  clienteNome: string | null;
  cnpj: string | null;
  invoiceNumber: string | null;
  xmlPedido: string | null;
  motivo: string;
};

export type XmlPedidoVinculoPlan = {
  vinculados: XmlPedidoVinculoPreview[];
  parcelasFaltantes: WegParcelaPreview[];
  semPedidoXml: XmlPedidoSkip[];
  semXml: XmlPedidoSkip[];
  ambiguos: XmlPedidoSkip[];
  pedidoXmlSemErp: XmlPedidoSkip[];
  jaVinculados: number;
};

function familyBaseDigits(pedido: string): string | null {
  const digits = normalizePedidoDigits(pedido);
  if (digits.length <= 10) return null;
  if (digits.length > 14) return null;
  return digits.slice(0, 10);
}

/** Pedido WEG/ME: 451 + 7 a 11 dígitos (10–14 no total). Não cria parcela com CNPJ. */
function isWegParcelaNumber(pedido: string): boolean {
  const digits = normalizePedidoDigits(pedido);
  return /^451\d{7,11}$/.test(digits);
}

export function planXmlPedidoVinculos(input: {
  rows: XmlPedidoVendaRow[];
  orders: XmlPedidoOrder[];
  productsBySku?: Map<string, ProductRef>;
  customerByDoc?: Map<string, string>;
}): XmlPedidoVinculoPlan {
  const vinculados: XmlPedidoVinculoPreview[] = [];
  const parcelasFaltantes: WegParcelaPreview[] = [];
  const semPedidoXml: XmlPedidoSkip[] = [];
  const semXml: XmlPedidoSkip[] = [];
  const ambiguos: XmlPedidoSkip[] = [];
  const pedidoXmlSemErp: XmlPedidoSkip[] = [];
  const takenVendas = new Set<string>();
  const takenOrders = new Set<string>();

  const holdingByVenda = new Map<string, XmlPedidoOrder>();
  let jaVinculados = 0;
  for (const order of input.orders) {
    if (!order.contaAzulVendaId) continue;
    jaVinculados += 1;
    if (!holdingByVenda.has(order.contaAzulVendaId)) {
      holdingByVenda.set(order.contaAzulVendaId, order);
    }
  }

  const skip = (
    bucket: XmlPedidoSkip[],
    row: XmlPedidoVendaRow,
    motivo: string,
    extra?: { xmlPedido?: string | null; invoiceNumber?: string | null },
  ) => {
    bucket.push({
      vendaId: row.venda.contaAzulId,
      vendaNumero: row.venda.numero,
      vendaTotal: row.venda.total,
      clienteNome: row.venda.clienteNome,
      cnpj:
        row.xml?.destDocumento ||
        documentDigits(row.venda.clienteDocumento) ||
        null,
      invoiceNumber: extra?.invoiceNumber ?? row.xml?.invoiceNumber ?? null,
      xmlPedido: extra?.xmlPedido ?? null,
      motivo,
    });
  };

  for (const row of input.rows) {
    const venda = row.venda;
    if (takenVendas.has(venda.contaAzulId)) continue;
    const holding = holdingByVenda.get(venda.contaAzulId) ?? null;

    if (row.xmlError || !row.xml) {
      skip(semXml, row, row.xmlError || 'XML da NF não disponível');
      continue;
    }

    const ref = extractXmlPedidoNumber(row.xml);
    if (!ref) {
      skip(
        semPedidoXml,
        row,
        'XML sem <xPed> nem padrão PEDIDO: na observação — não adivinha',
        { invoiceNumber: row.xml.invoiceNumber },
      );
      continue;
    }

    const destNome = row.xml.destNome;
    if (isInternalEnergyBrandsSale(venda.clienteNome, destNome)) {
      skip(
        semPedidoXml,
        row,
        'Venda interna Energy Brands — ignora vínculo e parcela',
        { xmlPedido: ref.pedido, invoiceNumber: row.xml.invoiceNumber },
      );
      continue;
    }

    const matches = findExactOrdersByPedido(ref.pedido, input.orders);
    const active = matches.filter((o) => {
      const s = String(o.status).toUpperCase();
      return s !== 'CANCELADO' && s !== 'ARQUIVADO';
    });
    const candidates = active.length ? active : matches;

    if (candidates.length > 1) {
      skip(
        ambiguos,
        row,
        `xPed ${ref.pedido} bateu com ${candidates.length} pedidos — não vincula`,
        { xmlPedido: ref.pedido, invoiceNumber: row.xml.invoiceNumber },
      );
      continue;
    }

    if (candidates.length === 1) {
      const order = candidates[0];
      if (order.contaAzulVendaId && order.contaAzulVendaId !== venda.contaAzulId) {
        skip(
          ambiguos,
          row,
          `Pedido ${order.externalOrderNumber} já vinculado a outra venda`,
          { xmlPedido: ref.pedido, invoiceNumber: row.xml.invoiceNumber },
        );
        continue;
      }
      if (takenOrders.has(order.id) && holding?.id !== order.id) {
        skip(
          ambiguos,
          row,
          `Pedido ${order.externalOrderNumber} já recebeu outro vínculo neste lote`,
          { xmlPedido: ref.pedido, invoiceNumber: row.xml.invoiceNumber },
        );
        continue;
      }
      takenOrders.add(order.id);
      takenVendas.add(venda.contaAzulId);
      if (holding?.id === order.id) {
        continue;
      }
      const currentNf = String(order.invoiceNumber ?? '').trim();
      const xmlNf = String(row.xml.invoiceNumber ?? '').trim();
      vinculados.push({
        vendaId: venda.contaAzulId,
        vendaNumero: venda.numero,
        vendaTotal: venda.total,
        clienteNome: venda.clienteNome,
        cnpj:
          row.xml.destDocumento ||
          documentDigits(venda.clienteDocumento) ||
          null,
        orderId: order.id,
        orderCode: order.code,
        externalOrderNumber: order.externalOrderNumber,
        invoiceNumber: xmlNf || currentNf || null,
        xmlPedido: ref.pedido,
        via: ref.via,
        reason: ref.via,
        preencherInvoice: Boolean(xmlNf) && (!currentNf || currentNf !== xmlNf),
        fromOrderId: holding && holding.id !== order.id ? holding.id : null,
        fromOrderCode: holding && holding.id !== order.id ? holding.code : null,
        reatribuir: Boolean(holding && holding.id !== order.id),
      });
      continue;
    }

    const namesWeg = isWegDestinatario(destNome, venda.clienteNome);
    if (namesWeg && isWegParcelaNumber(ref.pedido)) {
      const base = familyBaseDigits(ref.pedido);
      const family = base
        ? findExactOrdersByPedido(base, input.orders)[0]
        : undefined;
      const cnpj =
        row.xml.destDocumento ||
        documentDigits(venda.clienteDocumento) ||
        null;
      const items = row.xml.items.map((item, idx) =>
        toAddPatch(item, (idx + 1) * 10, input.productsBySku),
      );
      parcelasFaltantes.push({
        vendaId: venda.contaAzulId,
        vendaNumero: venda.numero,
        xmlPedido: ref.pedido,
        via: ref.via,
        invoiceNumber: row.xml.invoiceNumber,
        clienteNome: venda.clienteNome,
        destNome,
        cnpj,
        itens: items.length,
        total: row.xml.total || venda.total,
        familyBaseOrderCode: family?.code ?? null,
        familyBaseOrderId: family?.id ?? null,
        items,
        destEnderecoJson: row.xml.destEnderecoJson,
        destCidade: row.xml.destCidade,
        destUf: row.xml.destUf,
        emitidaEm: row.xml.emitidaEm,
        customerId: cnpj
          ? input.customerByDoc?.get(cnpj) ??
            input.customerByDoc?.get(documentDigits(cnpj)) ??
            null
          : null,
        unlinkFromOrderId: holding?.id ?? null,
        unlinkFromOrderCode: holding?.code ?? null,
      });
      takenVendas.add(venda.contaAzulId);
      continue;
    }

    skip(
      pedidoXmlSemErp,
      row,
      namesWeg
        ? `XML pedido ${ref.pedido} não existe no ERP e não parece número WEG (451…) — não cria parcela`
        : `XML pedido ${ref.pedido} não existe no ERP e o destinatário não é WEG — não cria parcela`,
      { xmlPedido: ref.pedido, invoiceNumber: row.xml.invoiceNumber },
    );
  }

  return {
    vinculados,
    parcelasFaltantes,
    semPedidoXml,
    semXml,
    ambiguos,
    pedidoXmlSemErp,
    jaVinculados,
  };
}
