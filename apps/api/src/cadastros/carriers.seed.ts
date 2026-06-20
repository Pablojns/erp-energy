import type { PrismaService } from '../prisma/prisma.service';

/** CNPJs normalizados (somente dígitos) por transportadora. */
export const CARRIER_SEED: Array<{ name: string; documents: string[] }> = [
  {
    name: 'JADLOG',
    documents: [
      '07175725004238',
      '10885321000174',
      '07175725004319',
    ],
  },
  {
    name: 'EXPRESSO SAO MIGUEL',
    documents: [
      '07175725001484',
      '07175725001050',
      '14309992000148',
      '84584994000716',
      '07175725001212',
      '60621141000404',
      '14309992000229',
    ],
  },
  {
    name: 'ALFA',
    documents: [],
  },
  {
    name: 'ENVIA RAPIDO',
    documents: [],
  },
];

export async function seedCarriers(
  prisma: PrismaService['client'],
): Promise<void> {
  for (const row of CARRIER_SEED) {
    const carrier = await prisma.carrier.upsert({
      where: { name: row.name },
      create: { name: row.name, isActive: true },
      update: { isActive: true },
    });

    for (const document of row.documents) {
      await prisma.carrierDocument.upsert({
        where: { document },
        create: { carrierId: carrier.id, document },
        update: { carrierId: carrier.id },
      });
    }
  }
}
