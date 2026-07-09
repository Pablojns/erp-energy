export type ParsedDeliveryAddress = {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

/** Endereço serializado no cadastro de clientes (`delivery-address.ts` no web). */
export function parseStoredDeliveryAddress(
  raw: string | null | undefined,
): ParsedDeliveryAddress | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.v !== 1 && !parsed.logradouro && !parsed.cep) return null;

    const cep = String(parsed.cep ?? '').replace(/\D/g, '');
    if (cep.length !== 8) return null;

    const logradouro = String(parsed.logradouro ?? '').trim();
    const cidade = String(parsed.cidade ?? '').trim();
    const uf = String(parsed.uf ?? '').trim().toUpperCase();
    if (!logradouro || !cidade || !uf) return null;

    const numero = String(parsed.numero ?? '').trim() || 'S/N';

    return {
      cep,
      logradouro,
      numero,
      complemento: String(parsed.complemento ?? '').trim(),
      bairro: String(parsed.bairro ?? '').trim(),
      cidade,
      uf,
    };
  } catch {
    return null;
  }
}
