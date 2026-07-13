import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrderStatus } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_PRIORITY,
  NOTIFICATION_TYPES,
} from './notification.constants';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsCron {
  private readonly logger = new Logger(NotificationsCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 * * * *')
  async runHourlyChecks(): Promise<void> {
    try {
      await this.checkOverdueOrders();
      await this.checkNfPending();
      await this.checkUrgentOrders();
      await this.checkLowStock();
      await this.checkStockOut();
      await this.checkPurchaseOverdue();
      await this.checkProposalExpiring();
      await this.checkFinishedWithoutInvoice();
    } catch (error) {
      this.logger.error(
        'Falha nas verificações agendadas de notificações',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private startOfTodayUtc(): Date {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return today;
  }

  private orderLabel(order: {
    externalOrderNumber: string | null;
    code: string;
  }): string {
    return order.externalOrderNumber ?? order.code;
  }

  private async checkOverdueOrders(): Promise<void> {
    const today = this.startOfTodayUtc();
    const orders = await this.prisma.client.order.findMany({
      where: {
        requestedDeliveryDate: { lt: today },
        status: { notIn: [OrderStatus.FINALIZADO, OrderStatus.CANCELADO] },
      },
      select: {
        id: true,
        externalOrderNumber: true,
        code: true,
      },
    });

    for (const order of orders) {
      const link = `/app/expedicao/pedidos`;
      const type = NOTIFICATION_TYPES.ORDER_DELAYED;
      if (await this.notifications.hasUnreadDuplicate(type, order.id)) {
        continue;
      }

      const label = this.orderLabel(order);
      await this.notifications.createForPermission(
        'notificacoes',
        'receber_expedicao',
        'Pedido atrasado',
        `O pedido ${label} está com entrega prevista vencida.`,
        type,
        link,
        {
          entityId: order.id,
          entityType: 'order',
          priority: NOTIFICATION_PRIORITY.HIGH,
        },
      );
    }
  }

  private async checkNfPending(): Promise<void> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const orders = await this.prisma.client.order.findMany({
      where: {
        status: {
          in: [
            OrderStatus.EM_SEPARACAO,
            OrderStatus.SEPARADO,
            OrderStatus.PARCIAL,
            OrderStatus.RESERVADO,
          ],
        },
        OR: [{ invoiceNumber: null }, { invoiceNumber: '' }],
        updatedAt: { lte: oneDayAgo },
      },
      select: {
        id: true,
        externalOrderNumber: true,
        code: true,
      },
    });

    for (const order of orders) {
      const type = NOTIFICATION_TYPES.NF_PENDING;
      if (await this.notifications.hasUnreadDuplicate(type, order.id)) {
        continue;
      }

      const label = this.orderLabel(order);
      await this.notifications.createForPermission(
        'notificacoes',
        'receber_expedicao',
        'NF pendente',
        `O pedido ${label} foi separado há mais de 1 dia sem NF emitida.`,
        type,
        '/app/expedicao/pedidos',
        {
          entityId: order.id,
          entityType: 'order',
          priority: NOTIFICATION_PRIORITY.HIGH,
        },
      );
    }
  }

  private async checkUrgentOrders(): Promise<void> {
    const orders = await this.prisma.client.order.findMany({
      where: {
        isUrgentManual: true,
        status: {
          in: [OrderStatus.NOVO, OrderStatus.RESERVADO, OrderStatus.PARCIAL],
        },
      },
      select: {
        id: true,
        externalOrderNumber: true,
        code: true,
      },
    });

    for (const order of orders) {
      const type = NOTIFICATION_TYPES.ORDER_URGENT;
      if (await this.notifications.hasUnreadDuplicate(type, order.id)) {
        continue;
      }

      const label = this.orderLabel(order);
      await this.notifications.createForPermission(
        'notificacoes',
        'receber_expedicao',
        'Pedido urgente',
        `O pedido ${label} está marcado como urgente e ainda não iniciou separação.`,
        type,
        '/app/expedicao/pedidos',
        {
          entityId: order.id,
          entityType: 'order',
          priority: NOTIFICATION_PRIORITY.URGENT,
        },
      );
    }
  }

  private async checkLowStock(): Promise<void> {
    const lowStock = (
      await this.prisma.client.product.findMany({
        where: { isActive: true, minStock: { gt: 0 } },
        select: {
          id: true,
          name: true,
          sku: true,
          stockQty: true,
          minStock: true,
        },
      })
    ).filter((product) => product.stockQty < product.minStock);

    for (const product of lowStock) {
      const type = NOTIFICATION_TYPES.STOCK_LOW;
      if (await this.notifications.hasUnreadDuplicate(type, product.id)) {
        continue;
      }

      await this.notifications.createForPermission(
        'notificacoes',
        'receber_estoque',
        'Estoque baixo',
        `${product.name} (${product.sku}) está abaixo do mínimo (${product.stockQty}/${product.minStock}).`,
        type,
        '/app/estoque',
        {
          entityId: product.id,
          entityType: 'product',
          priority: NOTIFICATION_PRIORITY.NORMAL,
        },
      );
    }
  }

  private async checkStockOut(): Promise<void> {
    const outProducts = await this.prisma.client.product.findMany({
      where: {
        isActive: true,
        stockQty: { lte: 0 },
        orderItems: {
          some: {
            order: {
              status: {
                notIn: [OrderStatus.FINALIZADO, OrderStatus.CANCELADO],
              },
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        sku: true,
      },
    });

    for (const product of outProducts) {
      const type = NOTIFICATION_TYPES.STOCK_OUT;
      if (await this.notifications.hasUnreadDuplicate(type, product.id)) {
        continue;
      }

      await this.notifications.createForPermission(
        'notificacoes',
        'receber_estoque',
        'Estoque zerado',
        `${product.name} (${product.sku}) está zerado com pedido pendente.`,
        type,
        '/app/estoque',
        {
          entityId: product.id,
          entityType: 'product',
          priority: NOTIFICATION_PRIORITY.HIGH,
        },
      );
    }
  }

  private async checkPurchaseOverdue(): Promise<void> {
    const today = this.startOfTodayUtc();
    const purchases = await this.prisma.client.purchaseRequest.findMany({
      where: {
        expectedArrival: { lt: today },
        status: { notIn: ['RECEBIDO', 'RECUSADO'] },
      },
      select: {
        id: true,
        itemName: true,
        sku: true,
        product: { select: { name: true } },
      },
    });

    for (const purchase of purchases) {
      const type = NOTIFICATION_TYPES.PURCHASE_OVERDUE;
      if (await this.notifications.hasUnreadDuplicate(type, purchase.id)) {
        continue;
      }

      const label =
        purchase.itemName ?? purchase.product?.name ?? purchase.sku ?? 'Item';
      await this.notifications.createForPermission(
        'notificacoes',
        'receber_compras',
        'Compra atrasada',
        `${label} passou da data prevista sem recebimento.`,
        type,
        '/app/compras',
        {
          entityId: purchase.id,
          entityType: 'purchase',
          priority: NOTIFICATION_PRIORITY.HIGH,
        },
      );
    }
  }

  private async checkProposalExpiring(): Promise<void> {
    const now = new Date();
    const inTwoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const proposals = await this.prisma.client.crmProposta.findMany({
      where: {
        validade: {
          gte: now,
          lte: inTwoDays,
        },
        status: { notIn: ['ACEITA', 'RECUSADA', 'CANCELADA'] },
      },
      select: {
        id: true,
        titulo: true,
        numero: true,
        card: {
          select: {
            id: true,
            name: true,
            responsavelId: true,
          },
        },
      },
    });

    for (const proposal of proposals) {
      const type = NOTIFICATION_TYPES.CRM_PROPOSAL_EXPIRING;
      if (await this.notifications.hasUnreadDuplicate(type, proposal.id)) {
        continue;
      }

      const recipients = new Set<string>();
      if (proposal.card.responsavelId) {
        recipients.add(proposal.card.responsavelId);
      }

      await Promise.all(
        [...recipients].map((userId) =>
          this.notifications.create(
            userId,
            'Proposta vencendo',
            `A proposta "${proposal.titulo}" (${proposal.numero}) do lead ${proposal.card.name} vence em até 2 dias.`,
            type,
            '/app/crm',
            {
              entityId: proposal.id,
              entityType: 'crm_card',
              priority: NOTIFICATION_PRIORITY.HIGH,
            },
          ),
        ),
      );
    }
  }

  /** Mantém verificação legada de pedidos finalizados sem NF (3+ dias). */
  private async checkFinishedWithoutInvoice(): Promise<void> {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const orders = await this.prisma.client.order.findMany({
      where: {
        status: OrderStatus.FINALIZADO,
        OR: [{ invoiceNumber: null }, { invoiceNumber: '' }],
        updatedAt: { lte: threeDaysAgo },
      },
      select: {
        id: true,
        externalOrderNumber: true,
        code: true,
      },
    });

    for (const order of orders) {
      const link = `order:${order.id}`;
      const type = 'pedido_sem_nf';
      if (await this.notifications.hasRecentDuplicate(type, link)) {
        continue;
      }

      const label = this.orderLabel(order);
      await this.notifications.createForPermission(
        'notificacoes',
        'receber_expedicao',
        'Pedido sem NF',
        `O pedido ${label} está finalizado há mais de 3 dias sem nota fiscal.`,
        type,
        link,
        {
          entityId: order.id,
          entityType: 'order',
          priority: NOTIFICATION_PRIORITY.HIGH,
        },
      );
    }
  }
}
