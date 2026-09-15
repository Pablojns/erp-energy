export type CnpjLookupResult = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  source: 'brasilapi' | 'receitaws';
};

function asText(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function composeLogradouro(tipo: string, logradouro: string): string {
  const street = logradouro.trim();
  const kind = tipo.trim();
  if (!kind || !street) return street;
  if (street.toUpperCase().startsWith(kind.toUpperCase())) return street;
  return `${kind} ${street}`.trim();
}

export function mapBrasilApiCnpj(
  data: Record<string, unknown>,
  fallbackCnpj: string,
): CnpjLookupResult | null {
  const razao =
    asText(data.razao_social) || asText(data.nome_fantasia);
  const cnpj = digitsOnly(asText(data.cnpj) || fallbackCnpj);
  if (!razao || cnpj.length !== 14) return null;
  const cep = digitsOnly(asText(data.cep)).slice(0, 8);
  return {
    cnpj,
    razaoSocial: razao,
    nomeFantasia: asText(data.nome_fantasia) || null,
    cep,
    logradouro: composeLogradouro(
      asText(data.descricao_tipo_de_logradouro),
      asText(data.logradouro),
    ),
    numero: asText(data.numero),
    complemento: asText(data.complemento),
    bairro: asText(data.bairro),
    cidade: asText(data.municipio),
    uf: asText(data.uf).toUpperCase(),
    source: 'brasilapi',
  };
}

export function mapReceitaWsCnpj(
  data: Record<string, unknown>,
  fallbackCnpj: string,
): CnpjLookupResult | null {
  const status = asText(data.status).toUpperCase();
  if (status && status !== 'OK') return null;
  const razao = asText(data.nome) || asText(data.fantasia);
  const cnpj = digitsOnly(asText(data.cnpj) || fallbackCnpj);
  if (!razao || cnpj.length !== 14) return null;
  const cep = digitsOnly(asText(data.cep)).slice(0, 8);
  return {
    cnpj,
    razaoSocial: razao,
    nomeFantasia: asText(data.fantasia) || null,
    cep,
    logradouro: asText(data.logradouro),
    numero: asText(data.numero),
    complemento: asText(data.complemento),
    bairro: asText(data.bairro),
    cidade: asText(data.municipio),
    uf: asText(data.uf).toUpperCase(),
    source: 'receitaws',
  };
}
