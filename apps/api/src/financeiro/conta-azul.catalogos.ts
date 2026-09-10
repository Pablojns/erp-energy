function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

export type CaCatalogoItem = {
  contaAzulId: string;
  nome: string;
  codigo: string | null;
  paiId: string | null;
  ativo: boolean;
};

export function mapContaAzulCategoria(
  item: Record<string, unknown>,
): CaCatalogoItem | null {
  const id = asText(item.id) ?? asText(item.uuid);
  const nome = asText(item.nome) ?? asText(item.descricao);
  if (!id || !nome) return null;
  const pai = asRecord(item.categoria_pai) ?? asRecord(item.pai);
  return {
    contaAzulId: id,
    nome,
    codigo: asText(item.codigo),
    paiId:
      asText(item.id_categoria_pai) ??
      asText(pai?.id) ??
      (typeof item.categoria_pai === 'string'
        ? asText(item.categoria_pai)
        : null),
    ativo: item.ativo === false ? false : true,
  };
}

export function mapContaAzulCentroCusto(
  item: Record<string, unknown>,
): CaCatalogoItem | null {
  const id = asText(item.id) ?? asText(item.uuid);
  const nome = asText(item.nome) ?? asText(item.descricao);
  if (!id || !nome) return null;
  return {
    contaAzulId: id,
    nome,
    codigo: asText(item.codigo),
    paiId: null,
    ativo: item.ativo === false ? false : true,
  };
}
