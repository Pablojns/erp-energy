import type { PrismaService } from '../prisma/prisma.service';

type CompanyEntityDb = Pick<PrismaService['client'], 'companyEntity'>;

/** CNPJs Energy Brands (somente dígitos). Matriz SP conhecida no ERP; filial Londrina editável na UI. */
export const COMPANY_CNPJ_SAO_PAULO = '48783884000124';
export const COMPANY_CNPJ_LONDRINA = '48783884000205';

/** Atribuição automática por origem: WEG → SP; Site → Londrina. */
export const COMPANY_ENTITY_SEED = [
  {
    name: 'Energy Brands São Paulo',
    cnpj: COMPANY_CNPJ_SAO_PAULO,
    isMatriz: true,
    inscricaoEstadual: null as string | null,
    endereco: null as string | null,
  },
  {
    name: 'Energy Brands Londrina',
    /** Filial 0002 do mesmo root — confirme/ajuste o CNPJ real em Cadastros → Empresas. */
    cnpj: COMPANY_CNPJ_LONDRINA,
    isMatriz: false,
    inscricaoEstadual: null as string | null,
    endereco: null as string | null,
  },
] as const;

export async function seedCompanyEntities(
  prisma: CompanyEntityDb,
): Promise<void> {
  for (const row of COMPANY_ENTITY_SEED) {
    const existing = await prisma.companyEntity.findUnique({
      where: { cnpj: row.cnpj },
    });
    if (existing) {
      await prisma.companyEntity.update({
        where: { id: existing.id },
        data: {
          name: row.name,
          isMatriz: row.isMatriz,
          isActive: true,
        },
      });
      continue;
    }

    // Evita duplicar por nome se o CNPJ da filial for ajustado depois.
    const byName = await prisma.companyEntity.findFirst({
      where: { name: row.name },
    });
    if (byName) {
      await prisma.companyEntity.update({
        where: { id: byName.id },
        data: {
          cnpj: row.cnpj,
          isMatriz: row.isMatriz,
          isActive: true,
        },
      });
      continue;
    }

    await prisma.companyEntity.create({
      data: {
        name: row.name,
        cnpj: row.cnpj,
        isMatriz: row.isMatriz,
        inscricaoEstadual: row.inscricaoEstadual,
        endereco: row.endereco,
        isActive: true,
      },
    });
  }
}

export async function findCompanyEntityIdByCnpj(
  prisma: CompanyEntityDb,
  cnpj: string,
): Promise<string | null> {
  const row = await prisma.companyEntity.findFirst({
    where: { cnpj, isActive: true },
    select: { id: true },
  });
  return row?.id ?? null;
}

/** Pedidos WEG → Energy Brands São Paulo (matriz). */
export async function findSaoPauloCompanyEntityId(
  prisma: CompanyEntityDb,
): Promise<string | null> {
  return findCompanyEntityIdByCnpj(prisma, COMPANY_CNPJ_SAO_PAULO);
}

/** Pedidos Site → Energy Brands Londrina (filial). */
export async function findLondrinaCompanyEntityId(
  prisma: CompanyEntityDb,
): Promise<string | null> {
  return findCompanyEntityIdByCnpj(prisma, COMPANY_CNPJ_LONDRINA);
}
