import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type SearchResultItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export type GlobalSearchResponse = {
  orders: SearchResultItem[];
  products: SearchResultItem[];
  customers: SearchResultItem[];
};

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(term: string): Promise<GlobalSearchResponse> {
    const q = term.trim();
    if (!q) {
      return { orders: [], products: [], customers: [] };
    }

    const contains = { contains: q, mode: 'insensitive' as const };

    const [orders, products, customers] = await Promise.all([
      this.prisma.client.order.findMany({
        where: {
          OR: [
            { code: contains },
            { externalOrderNumber: contains },
            { receiverName: contains },
            { invoiceNumber: contains },
            { customerName: contains },
          ],
        },
        take: 5,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          code: true,
          externalOrderNumber: true,
          receiverName: true,
          customerName: true,
          invoiceNumber: true,
        },
      }),
      this.prisma.client.product.findMany({
        where: {
          OR: [{ sku: contains }, { name: contains }],
        },
        take: 5,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          sku: true,
          name: true,
        },
      }),
      this.prisma.client.customer.findMany({
        where: {
          OR: [{ name: contains }, { document: contains }],
        },
        take: 5,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          document: true,
        },
      }),
    ]);

    return {
      orders: orders.map((order) => {
        const displayNumber = order.externalOrderNumber?.trim() || order.code;
        const receiver = order.receiverName?.trim() || order.customerName;
        const nf = order.invoiceNumber?.trim();
        return {
          id: order.id,
          title: displayNumber,
          subtitle: [receiver, nf ? `NF ${nf}` : null].filter(Boolean).join(' · '),
          href: `/app/expedicao/pedidos?search=${encodeURIComponent(displayNumber)}`,
        };
      }),
      products: products.map((product) => ({
        id: product.id,
        title: product.name,
        subtitle: `SKU ${product.sku}`,
        href: `/app/estoque?tab=inventory&sku=${encodeURIComponent(product.sku)}`,
      })),
      customers: customers.map((customer) => ({
        id: customer.id,
        title: customer.name,
        subtitle: customer.document?.trim() || 'Sem documento',
        href: '/app/cadastros',
      })),
    };
  }
}
