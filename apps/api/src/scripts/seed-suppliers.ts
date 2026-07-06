import { readFileSync } from 'fs';
import { resolve } from 'path';
import { prisma } from '@erp/database';

const SUPPLIER_NAMES = [
  'ABILITÁ',
  'CRIS BONÉS',
  'CROMO (SANDRA)',
  'CROWN',
  'HELPI',
  'J&M (SANDRA)',
  'KITS HIGIENE',
  'PRIMESET',
  'RAFEGE',
  'SPOT',
  'WOOCH',
  'XBZ',
  'XBZ/ESTRELA',
  'XBZ/KAPBOM',
] as const;

/** SKU → nome do fornecedor (null = sem vínculo). */
const SKU_SUPPLIER_MAP: Record<string, string | null> = {
  '50019097': 'XBZ/ESTRELA',
  '50141535': 'SPOT',
  '50043396': 'SPOT',
  provi0001: 'SPOT',
  '50020098': 'CROWN',
  '50080252': 'CROWN',
  '50141547': 'SPOT',
  '50141549': 'SPOT',
  '50141548': 'SPOT',
  '50141682': 'XBZ',
  '50141691': 'XBZ',
  '50141713': 'SPOT',
  '50141712': 'SPOT',
  '50141714': 'XBZ/ESTRELA',
  '50141683': 'SPOT',
  '50141684': 'SPOT',
  '50141686': 'SPOT',
  '50141687': 'SPOT',
  '50141688': 'XBZ',
  '50141689': 'XBZ',
  '50141690': 'WOOCH',
  '50141716': 'SPOT',
  '50141717': 'XBZ',
  '50141720': 'XBZ',
  '50141721': 'XBZ',
  '50141722': 'XBZ',
  '50141718': 'XBZ',
  '50141719': 'CRIS BONÉS',
  '50043487': 'HELPI',
  '50060154': 'CROMO (SANDRA)',
  '50019098': 'CROMO (SANDRA)',
  '50019099': 'CROMO (SANDRA)',
  '50138037': 'CROMO (SANDRA)',
  '50019096': 'J&M (SANDRA)',
  '50020119': 'J&M (SANDRA)',
  '50019983': 'PRIMESET',
  provi0002: 'PRIMESET',
  '50141715': 'XBZ/KAPBOM',
  '50020124': 'CROMO (SANDRA)',
  '50141550': 'SPOT',
  '50141551': 'SPOT',
  '50141685': 'SPOT',
  '50084585': null,
  '50043062': 'XBZ',
  '50022829': 'KITS HIGIENE',
  '50141725': null,
  '50141723': 'XBZ',
  '50022677': 'CROMO (SANDRA)',
  '50021734': 'CROMO (SANDRA)',
  '50022680': 'CROMO (SANDRA)',
  '50084732': 'CROMO (SANDRA)',
  '50030210': 'RAFEGE',
  '50030209': 'RAFEGE',
  '50030207': 'RAFEGE',
  '50030208': 'RAFEGE',
  '50038047': 'RAFEGE',
  '50084117': 'RAFEGE',
  provi0003: 'RAFEGE',
  provi0004: 'RAFEGE',
  '50084118': 'RAFEGE',
  '50038046': 'RAFEGE',
  '50084119': 'RAFEGE',
  '50030187': 'RAFEGE',
  '50084120': 'RAFEGE',
  provi0005: 'RAFEGE',
  provi0006: 'RAFEGE',
  provi0007: 'RAFEGE',
  '50020823': 'RAFEGE',
  '50020827': 'RAFEGE',
  '50020829': 'RAFEGE',
  '50020847': 'RAFEGE',
  '50020853': 'RAFEGE',
  '50145196': 'RAFEGE',
  '50145197': 'RAFEGE',
  '50145198': 'RAFEGE',
  '50041817': 'RAFEGE',
  '50041818': 'RAFEGE',
  '50041819': 'RAFEGE',
  '50041820': 'RAFEGE',
  provi0008: 'RAFEGE',
  provi0009: 'RAFEGE',
  provi0010: 'RAFEGE',
  provi0011: 'RAFEGE',
  '50145338': 'RAFEGE',
  '50145339': 'RAFEGE',
  '50145340': 'RAFEGE',
  '50145341': 'RAFEGE',
  '50145422': 'RAFEGE',
  '50145423': 'RAFEGE',
  '50145424': 'RAFEGE',
  '50145425': 'RAFEGE',
  '50145426': 'RAFEGE',
  '50145427': 'RAFEGE',
  '50145428': 'RAFEGE',
  '50145429': 'RAFEGE',
  '50145430': 'RAFEGE',
  provi0012: 'RAFEGE',
  provi0013: 'RAFEGE',
  provi0014: 'RAFEGE',
  '50030671': 'ABILITÁ',
  '50030672': 'ABILITÁ',
  '50030673': 'ABILITÁ',
  '50030190': 'ABILITÁ',
  '50030182': 'ABILITÁ',
  '50137933': 'ABILITÁ',
  '50137934': 'ABILITÁ',
  provi0015: 'ABILITÁ',
  '50137936': 'ABILITÁ',
  '50137937': 'ABILITÁ',
  '50137938': 'ABILITÁ',
  provi0016: 'ABILITÁ',
  provi0017: 'ABILITÁ',
  provi0018: 'ABILITÁ',
  provi0019: 'ABILITÁ',
  provi0020: 'ABILITÁ',
  '50081048': 'ABILITÁ',
  '50081049': 'ABILITÁ',
  '50081050': 'ABILITÁ',
  '50081051': 'ABILITÁ',
  '50081092': 'ABILITÁ',
  '50081093': 'ABILITÁ',
  '50081094': 'ABILITÁ',
  '50081095': 'ABILITÁ',
  '50081097': 'ABILITÁ',
  '50081096': 'ABILITÁ',
  '50081098': 'ABILITÁ',
  provi0021: 'ABILITÁ',
  provi0022: 'ABILITÁ',
  provi0023: 'ABILITÁ',
  provi0024: 'ABILITÁ',
  provi0025: 'ABILITÁ',
  provi0026: 'RAFEGE',
  provi0027: 'RAFEGE',
  provi0028: 'RAFEGE',
};

function loadEnvFile(): void {
  const envPath = resolve(__dirname, '../../.env');
  try {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    /* .env opcional se DATABASE_URL já estiver no ambiente */
  }
}

async function upsertSupplierByName(name: string): Promise<string> {
  const existing = await prisma.supplier.findFirst({
    where: { name },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }
  const created = await prisma.supplier.create({
    data: { name },
    select: { id: true },
  });
  return created.id;
}

async function main(): Promise<void> {
  loadEnvFile();

  try {
    const supplierIds = new Map<string, string>();
    let suppliersCreated = 0;

    for (const name of SUPPLIER_NAMES) {
      const before = await prisma.supplier.findFirst({
        where: { name },
        select: { id: true },
      });
      const id = await upsertSupplierByName(name);
      supplierIds.set(name, id);
      if (!before) {
        suppliersCreated += 1;
      }
    }

    console.log(
      `Fornecedores: ${SUPPLIER_NAMES.length} garantidos (${suppliersCreated} criados nesta execução).`,
    );

    let productsUpdated = 0;
    let productsMissing = 0;

    for (const [sku, supplierName] of Object.entries(SKU_SUPPLIER_MAP)) {
      const supplierId =
        supplierName === null ? null : (supplierIds.get(supplierName) ?? null);

      if (supplierName !== null && supplierId === null) {
        throw new Error(`Fornecedor não encontrado: ${supplierName}`);
      }

      const result = await prisma.product.updateMany({
        where: { sku },
        data: { supplierId },
      });

      if (result.count === 0) {
        productsMissing += 1;
        console.warn(`SKU não encontrado: ${sku}`);
      } else {
        productsUpdated += result.count;
      }
    }

    console.log(
      `Produtos vinculados: ${productsUpdated} atualizações (${productsMissing} SKUs ausentes no banco).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
