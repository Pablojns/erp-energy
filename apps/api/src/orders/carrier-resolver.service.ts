import { Injectable } from '@nestjs/common';
import { Prisma } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Omit<
  Prisma.TransactionClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

@Injectable()
export class CarrierResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /** Normaliza CNPJ/CPF para comparação (somente dígitos). */
  static normalizeDocument(raw: string | null | undefined): string | null {
    if (!raw?.trim()) return null;
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 11 ? digits : null;
  }

  async resolveCarrierId(
    cnpj: string | null | undefined,
    tx?: Tx,
  ): Promise<string | null> {
    const document = CarrierResolverService.normalizeDocument(cnpj);
    if (!document) return null;

    const client = tx ?? this.prisma.client;
    const row = await client.carrierDocument.findUnique({
      where: { document },
      select: { carrierId: true },
    });
    return row?.carrierId ?? null;
  }
}
