import {
  formatStoredDeliveryAddressDisplay,
  parseDeliveryAddressLoose,
  serializeStoredDeliveryAddress,
  type ParsedDeliveryAddress,
} from '../common/delivery-address';

export type CaPessoaPerfil = 'CLIENTE' | 'FORNECEDOR' | 'TRANSPORTADORA' | string;

export type CaPessoa = {
  contaAzulId: string;
  documento: string;
  documentoDigits: string;
  nome: string;
  tipoPessoa: string | null;
  perfis: string[];
  endereco: ParsedDeliveryAddress | null;
  enderecoJson: string | null;
  ativo: boolean;
};

export type CadastroFieldDiff = {
  from: string;
  to: string;
};

export type PedidoCadastroPreview = {
  orderId: string;
  code: string;
  externalOrderNumber: string | null;
  customerId: string | null;
  cnpj: string;
  receiverName: string | null;
  name: CadastroFieldDiff | null;
  address: CadastroFieldDiff | null;
};

export type ClienteCadastroPreview = {
  customerId: string;
  document: string;
  cnpj: string;
  name: CadastroFieldDiff | null;
  address: CadastroFieldDiff | null;
};

export type CadastroSyncOrderInput = {
  id: string;
  code: string;
  externalOrderNumber: string | null;
  customerId: string | null;
  customerName: string;
  receiverName?: string | null;
  customerDocument: string | null;
  deliveryCnpj: string | null;
  deliveryAddress: string | null;
};

export type CadastroSyncCustomerInput = {
  id: string;
  name: string;
  document: string | null;
  deliveryAddress: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

export function documentDigits(raw: string | number | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '');
}

export function normalizePersonName(raw: string | null | undefined): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function namesDiffer(from: string | null | undefined, to: string): boolean {
  const a = normalizePersonName(from);
  const b = normalizePersonName(to);
  if (!b) return false;
  if (!a) return true;
  return a !== b;
}

function mapAddress(raw: unknown): ParsedDeliveryAddress | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const logradouro = asText(rec.logradouro) ?? asText(rec.rua);
  const cidade = asText(rec.cidade);
  const uf = (asText(rec.estado) ?? asText(rec.uf) ?? '').toUpperCase();
  if (!logradouro || !cidade || !uf) return null;
  const cep = documentDigits(asText(rec.cep) ?? '');
  return {
    cep,
    logradouro,
    numero: asText(rec.numero) ?? 'S/N',
    complemento: asText(rec.complemento) ?? '',
    bairro: asText(rec.bairro) ?? '',
    cidade,
    uf,
  };
}

function pickBestAddress(item: Record<string, unknown>): ParsedDeliveryAddress | null {
  const single = mapAddress(item.endereco);
  if (single) return single;
  const list = item.enderecos;
  if (!Array.isArray(list) || list.length === 0) return null;
  const mapped = list
    .map((row) => mapAddress(row))
    .filter((row): row is ParsedDeliveryAddress => Boolean(row));
  if (mapped.length === 0) return null;
  const withCep = mapped.find((row) => row.cep.length === 8);
  return withCep ?? mapped[0];
}

function mapPerfis(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      out.push(item.trim().toUpperCase());
      continue;
    }
    const rec = asRecord(item);
    const tipo = asText(rec?.tipo_perfil) ?? asText(rec?.perfil);
    if (tipo) out.push(tipo.toUpperCase());
  }
  return [...new Set(out)];
}

export function mapContaAzulPessoa(
  item: Record<string, unknown>,
): CaPessoa | null {
  const id = asText(item.id) ?? asText(item.uuid);
  const nome =
    asText(item.nome_empresa) ?? asText(item.razao_social) ?? asText(item.nome);
  const documento = asText(item.documento) ?? '';
  const digits = documentDigits(documento);
  if (!id || !nome || digits.length < 11) return null;
  const endereco = pickBestAddress(item);
  return {
    contaAzulId: id,
    documento,
    documentoDigits: digits,
    nome,
    tipoPessoa: asText(item.tipo_pessoa),
    perfis: mapPerfis(item.perfis),
    endereco,
    enderecoJson: endereco ? serializeStoredDeliveryAddress(endereco) : null,
    ativo: item.ativo === false ? false : true,
  };
}

/** Nome do cadastro da pessoa na CA (filial), não a razão social genérica do grupo. */
export function mapContaAzulPessoaParaPedido(
  item: Record<string, unknown>,
): CaPessoa | null {
  const mapped = mapContaAzulPessoa(item);
  if (!mapped) return null;
  const nomeCadastro = asText(item.nome);
  if (nomeCadastro) mapped.nome = nomeCadastro;
  return mapped;
}

export function buyerNameLooksLikeReceiver(input: {
  customerName: string;
  receiverName?: string | null;
}): boolean {
  const buyer = normalizePersonName(input.customerName);
  const recv = normalizePersonName(input.receiverName);
  if (!buyer) return true;
  if (!recv) return false;
  if (buyer === recv) return true;
  const buyerHead = buyer.split(/[/\-]/)[0]?.trim() ?? '';
  const recvHead = recv.split(/[/\-]/)[0]?.trim() ?? '';
  return Boolean(buyerHead && recvHead && buyerHead === recvHead);
}

export function orderNeedsPedidoCadastroFill(input: {
  deliveryCnpj: string | null;
  deliveryAddress: string | null;
  customerName: string;
  receiverName?: string | null;
}): boolean {
  if (documentDigits(input.deliveryCnpj).length < 11) return false;
  const hasAddress = Boolean(
    parseDeliveryAddressLoose(input.deliveryAddress) ||
      input.deliveryAddress?.trim(),
  );
  if (!hasAddress) return true;
  return buyerNameLooksLikeReceiver(input);
}

function preferPessoa(a: CaPessoa, b: CaPessoa): CaPessoa {
  const score = (p: CaPessoa) =>
    (p.ativo ? 4 : 0) +
    (p.perfis.includes('CLIENTE') ? 2 : 0) +
    (p.endereco ? 1 : 0);
  return score(b) > score(a) ? b : a;
}

export function indexPessoasByDocumento(
  pessoas: CaPessoa[],
): Map<string, CaPessoa> {
  const map = new Map<string, CaPessoa>();
  for (const pessoa of pessoas) {
    const prev = map.get(pessoa.documentoDigits);
    map.set(
      pessoa.documentoDigits,
      prev ? preferPessoa(prev, pessoa) : pessoa,
    );
  }
  return map;
}

function addressesDiffer(
  fromRaw: string | null | undefined,
  to: ParsedDeliveryAddress,
): boolean {
  const from = parseDeliveryAddressLoose(fromRaw);
  if (!from) return true;
  if (from.logradouro.trim().toUpperCase() !== to.logradouro.trim().toUpperCase()) {
    return true;
  }
  if (from.numero.trim().toUpperCase() !== (to.numero.trim() || 'S/N').toUpperCase()) {
    return true;
  }
  if (from.cidade.trim().toUpperCase() !== to.cidade.trim().toUpperCase()) {
    return true;
  }
  if (from.uf.trim().toUpperCase() !== to.uf.trim().toUpperCase()) {
    return true;
  }
  if (to.cep.length === 8 && from.cep !== to.cep) return true;
  if (
    to.bairro &&
    from.bairro.trim().toUpperCase() !== to.bairro.trim().toUpperCase()
  ) {
    return true;
  }
  return false;
}

export function diffPedidoCadastro(input: {
  orderId: string;
  code: string;
  externalOrderNumber: string | null;
  customerId: string | null;
  customerName: string;
  receiverName?: string | null;
  customerDocument: string | null;
  deliveryCnpj: string | null;
  deliveryAddress: string | null;
  pessoa: CaPessoa;
}): PedidoCadastroPreview | null {
  const cnpj =
    documentDigits(input.deliveryCnpj) ||
    documentDigits(input.customerDocument);
  if (!cnpj || cnpj !== input.pessoa.documentoDigits) return null;

  const name = namesDiffer(input.customerName, input.pessoa.nome)
    ? {
        from: input.customerName?.trim() || '',
        to: input.pessoa.nome,
      }
    : null;

  const address =
    input.pessoa.endereco &&
    input.pessoa.enderecoJson &&
    addressesDiffer(input.deliveryAddress, input.pessoa.endereco)
      ? {
          from: formatStoredDeliveryAddressDisplay(input.deliveryAddress) || '',
          to: formatStoredDeliveryAddressDisplay(input.pessoa.enderecoJson),
        }
      : null;

  if (!name && !address) return null;
  return {
    orderId: input.orderId,
    code: input.code,
    externalOrderNumber: input.externalOrderNumber,
    customerId: input.customerId,
    cnpj,
    receiverName: input.receiverName ?? null,
    name,
    address,
  };
}

export function diffCustomerCadastro(input: {
  customerId: string;
  name: string;
  document: string | null;
  deliveryAddress: string | null;
  pessoa: CaPessoa;
}): ClienteCadastroPreview | null {
  const cnpj = documentDigits(input.document);
  if (!cnpj || cnpj !== input.pessoa.documentoDigits) return null;

  const name = namesDiffer(input.name, input.pessoa.nome)
    ? { from: input.name?.trim() || '', to: input.pessoa.nome }
    : null;
  const address =
    input.pessoa.endereco &&
    input.pessoa.enderecoJson &&
    addressesDiffer(input.deliveryAddress, input.pessoa.endereco)
      ? {
          from: formatStoredDeliveryAddressDisplay(input.deliveryAddress) || '',
          to: formatStoredDeliveryAddressDisplay(input.pessoa.enderecoJson),
        }
      : null;

  if (!name && !address) return null;
  return {
    customerId: input.customerId,
    document: input.document ?? cnpj,
    cnpj,
    name,
    address,
  };
}

export function planCadastroSync(input: {
  pessoas: CaPessoa[];
  orders: CadastroSyncOrderInput[];
  customers: CadastroSyncCustomerInput[];
}): {
  byDocumento: Map<string, CaPessoa>;
  pedidos: PedidoCadastroPreview[];
  clientes: ClienteCadastroPreview[];
} {
  const byDocumento = indexPessoasByDocumento(input.pessoas);
  const pedidos: PedidoCadastroPreview[] = [];
  for (const order of input.orders) {
    const digits =
      documentDigits(order.deliveryCnpj) ||
      documentDigits(order.customerDocument);
    const pessoa = digits ? byDocumento.get(digits) : undefined;
    if (!pessoa) continue;
    const diff = diffPedidoCadastro({
      orderId: order.id,
      code: order.code,
      externalOrderNumber: order.externalOrderNumber,
      customerId: order.customerId,
      customerName: order.customerName,
      receiverName: order.receiverName,
      customerDocument: order.customerDocument,
      deliveryCnpj: order.deliveryCnpj,
      deliveryAddress: order.deliveryAddress,
      pessoa,
    });
    if (diff) pedidos.push(diff);
  }

  const clientes: ClienteCadastroPreview[] = [];
  for (const customer of input.customers) {
    const digits = documentDigits(customer.document);
    const pessoa = digits ? byDocumento.get(digits) : undefined;
    if (!pessoa) continue;
    const diff = diffCustomerCadastro({
      customerId: customer.id,
      name: customer.name,
      document: customer.document,
      deliveryAddress: customer.deliveryAddress,
      pessoa,
    });
    if (diff) clientes.push(diff);
  }

  return { byDocumento, pedidos, clientes };
}

export function planPreencherPedidosCadastro(input: {
  pessoasByDocumento: Map<string, CaPessoa>;
  orders: CadastroSyncOrderInput[];
}): PedidoCadastroPreview[] {
  const pedidos: PedidoCadastroPreview[] = [];
  for (const order of input.orders) {
    const digits = documentDigits(order.deliveryCnpj);
    const pessoa = digits ? input.pessoasByDocumento.get(digits) : undefined;
    if (!pessoa?.endereco || !pessoa.enderecoJson) continue;
    const diff = diffPedidoCadastro({
      orderId: order.id,
      code: order.code,
      externalOrderNumber: order.externalOrderNumber,
      customerId: order.customerId,
      customerName: order.customerName,
      receiverName: order.receiverName,
      customerDocument: order.customerDocument,
      deliveryCnpj: order.deliveryCnpj,
      deliveryAddress: order.deliveryAddress,
      pessoa,
    });
    if (diff) pedidos.push(diff);
  }
  return pedidos;
}

export type ErpPartyKind = 'CUSTOMER' | 'SUPPLIER' | 'CARRIER';

export type ErpPartyInput = {
  kind: ErpPartyKind;
  id: string;
  name: string;
  document: string | null;
  extraDocuments?: string[];
  deliveryAddress?: string | null;
};

export type PessoaDivergence = {
  tipo: 'nome' | 'endereco' | 'so_conta_azul' | 'so_erp';
  kind: ErpPartyKind;
  erpId: string | null;
  contaAzulId: string | null;
  cnpj: string;
  name?: CadastroFieldDiff | null;
  address?: CadastroFieldDiff | null;
  erpName?: string;
  caName?: string;
};

function kindsForPessoa(pessoa: CaPessoa): ErpPartyKind[] {
  const kinds: ErpPartyKind[] = [];
  const joined = pessoa.perfis.join(' ');
  if (joined.includes('CLIENTE')) kinds.push('CUSTOMER');
  if (joined.includes('FORNECEDOR')) kinds.push('SUPPLIER');
  if (joined.includes('TRANSPORT')) kinds.push('CARRIER');
  return kinds.length ? kinds : ['CUSTOMER', 'SUPPLIER', 'CARRIER'];
}

function partyDigits(party: ErpPartyInput): string[] {
  const out = new Set<string>();
  const primary = documentDigits(party.document);
  if (primary.length >= 11) out.add(primary);
  for (const extra of party.extraDocuments ?? []) {
    const d = documentDigits(extra);
    if (d.length >= 11) out.add(d);
  }
  return [...out];
}

export function planPessoasDivergencias(input: {
  pessoas: CaPessoa[];
  parties: ErpPartyInput[];
}): {
  byDocumento: Map<string, CaPessoa>;
  divergencias: PessoaDivergence[];
} {
  const byDocumento = indexPessoasByDocumento(input.pessoas);
  const byKindDigits = new Map<string, ErpPartyInput[]>();
  const key = (kind: ErpPartyKind, digits: string) => `${kind}:${digits}`;
  for (const party of input.parties) {
    for (const digits of partyDigits(party)) {
      const k = key(party.kind, digits);
      const list = byKindDigits.get(k) ?? [];
      list.push(party);
      byKindDigits.set(k, list);
    }
  }

  const divergencias: PessoaDivergence[] = [];
  const matchedErp = new Set<string>();

  for (const pessoa of byDocumento.values()) {
    const kinds = kindsForPessoa(pessoa);
    let found = false;
    for (const kind of kinds) {
      const parties = byKindDigits.get(key(kind, pessoa.documentoDigits)) ?? [];
      if (parties.length === 0) continue;
      found = true;
      for (const party of parties) {
        matchedErp.add(`${party.kind}:${party.id}`);
        const name = namesDiffer(party.name, pessoa.nome)
          ? { from: party.name?.trim() || '', to: pessoa.nome }
          : null;
        const canAddress =
          kind !== 'SUPPLIER' &&
          Boolean(pessoa.endereco && pessoa.enderecoJson);
        const address =
          canAddress &&
          addressesDiffer(party.deliveryAddress, pessoa.endereco!)
            ? {
                from:
                  formatStoredDeliveryAddressDisplay(party.deliveryAddress) ||
                  '',
                to: formatStoredDeliveryAddressDisplay(pessoa.enderecoJson),
              }
            : null;
        if (name) {
          divergencias.push({
            tipo: 'nome',
            kind,
            erpId: party.id,
            contaAzulId: pessoa.contaAzulId,
            cnpj: pessoa.documentoDigits,
            name,
            erpName: party.name,
            caName: pessoa.nome,
          });
        }
        if (address) {
          divergencias.push({
            tipo: 'endereco',
            kind,
            erpId: party.id,
            contaAzulId: pessoa.contaAzulId,
            cnpj: pessoa.documentoDigits,
            address,
            erpName: party.name,
            caName: pessoa.nome,
          });
        }
      }
    }
    if (!found) {
      divergencias.push({
        tipo: 'so_conta_azul',
        kind: kinds[0],
        erpId: null,
        contaAzulId: pessoa.contaAzulId,
        cnpj: pessoa.documentoDigits,
        caName: pessoa.nome,
      });
    }
  }

  for (const party of input.parties) {
    const digitsList = partyDigits(party);
    if (digitsList.length === 0) continue;
    if (matchedErp.has(`${party.kind}:${party.id}`)) continue;
    const anyInCa = digitsList.some((d) => byDocumento.has(d));
    if (anyInCa) continue;
    divergencias.push({
      tipo: 'so_erp',
      kind: party.kind,
      erpId: party.id,
      contaAzulId: null,
      cnpj: digitsList[0],
      erpName: party.name,
    });
  }

  return { byDocumento, divergencias };
}
