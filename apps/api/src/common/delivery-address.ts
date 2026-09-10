export type ParsedDeliveryAddress = {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

/** Endereço JSON v1, mesmo sem CEP de 8 dígitos (útil para preview/sync). */
export function parseDeliveryAddressLoose(
  raw: string | null | undefined,
): ParsedDeliveryAddress | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.v !== 1 && !parsed.logradouro && !parsed.cep) return null;

    const logradouro = String(parsed.logradouro ?? '').trim();
    const cidade = String(parsed.cidade ?? '').trim();
    const uf = String(parsed.uf ?? '').trim().toUpperCase();
    if (!logradouro || !cidade || !uf) return null;

    return {
      cep: String(parsed.cep ?? '').replace(/\D/g, '').slice(0, 8),
      logradouro,
      numero: String(parsed.numero ?? '').trim() || 'S/N',
      complemento: String(parsed.complemento ?? '').trim(),
      bairro: String(parsed.bairro ?? '').trim(),
      cidade,
      uf,
    };
  } catch {
    return null;
  }
}

/** Endereço serializado no cadastro de clientes (`delivery-address.ts` no web). */
export function parseStoredDeliveryAddress(
  raw: string | null | undefined,
): ParsedDeliveryAddress | null {
  const parsed = parseDeliveryAddressLoose(raw);
  if (!parsed || parsed.cep.length !== 8) return null;
  return parsed;
}

export function serializeStoredDeliveryAddress(
  addr: ParsedDeliveryAddress,
): string {
  const cepDigits = String(addr.cep ?? '').replace(/\D/g, '').slice(0, 8);
  const cep =
    cepDigits.length === 8
      ? `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}`
      : cepDigits;
  return JSON.stringify({
    v: 1,
    cep,
    logradouro: addr.logradouro.trim(),
    bairro: addr.bairro.trim(),
    cidade: addr.cidade.trim(),
    uf: addr.uf.trim().toUpperCase(),
    numero: (addr.numero.trim() || 'S/N'),
    complemento: addr.complemento.trim(),
  });
}

export function formatStoredDeliveryAddressDisplay(
  raw: string | null | undefined,
): string {
  const parsed = parseDeliveryAddressLoose(raw);
  if (!parsed) {
    const trimmed = raw?.trim();
    return trimmed ? trimmed : '';
  }
  const parts = [
    `${parsed.logradouro}, ${parsed.numero}`,
    parsed.complemento || null,
    parsed.bairro || null,
    `${parsed.cidade}/${parsed.uf}`,
    parsed.cep ? `CEP ${parsed.cep.length === 8 ? `${parsed.cep.slice(0, 5)}-${parsed.cep.slice(5)}` : parsed.cep}` : null,
  ].filter(Boolean);
  return parts.join(' — ');
}
