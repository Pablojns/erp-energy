import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrderStatus } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_PRIORITY,
  NOTIFICATION_TYPES,
} from './notification.constants';
import { isBusinessHours, isMorningDigestHour } from './notification-time.util';
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
      await this.notifications.wakeSnoozedNotifications();
      await this.notifications.escalateUnresolvedToAdmin();

      if (isMorningDigestHour()) {
        await this.runMorningBatch();
        return;
      }

      if (!isBusinessHours()) {
        return;
      }

      await this.runAllChecks();
    } catch (error) {
      this.logger.error(
        'Falha nas verificações agendadas de notificações',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async runMorningBatch(): Promise<void> {
    await this.runAllChecks();
    await this.notifications.sendDailyDigests();
  }

  private async runAllChecks(): Promise<void> {
    await this.checkOverdueOrders();
    await this.checkNfPending();
    await this.checkUrgentOrders();
    await this.checkLowStock();
    await this.checkStockOut();
    await this.checkPurchaseOverdue();
    await this.checkProposalExpiring();
    await this.checkFinishedWithoutInvoice();
  }

  private async getConfig() {
    return this.notifications.getConfig();
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
    const config = await this.getConfig();
    const cutoff = new Date(this.startOfTodayUtc());
    cutoff.setUTCDate(cutoff.getUTCDate() - config.orderDelayedDays);

    const orders = await this.prisma.client.order.findMany({
      where: {
        requestedDeliveryDate: { lt: cutoff },
        status: { notIn: [OrderStatus.FINALIZADO, OrderStatus.CANCELADO] },
      },
      select: {
        id: true,
        externalOrderNumber: true,
        code: true,
      },
    });

    for (const order of orders) {
      const label = this.orderLabel(order);
      await this.notifications.notifyRouted({
        type: NOTIFICATION_TYPES.ORDER_DELAYED,
        title: 'Pedido atrasado',
        body: `O pedido ${label} está com entrega prevista vencida.`,
        link: '/app/expedicao/pedidos',
        entityId: order.id,
        entityType: 'order',
        label,
        priority: NOTIFICATION_PRIORITY.HIGH,
      });
    }
  }

  private async checkNfPending(): Promise<void> {
    const config = await this.getConfig();
    const cutoff = new Date(
      Date.now() - config.nfPendingHours * 60 * 60 * 1000,
    );

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
        updatedAt: { lte: cutoff },
      },
      select: {
        id: true,
        externalOrderNumber: true,
        code: true,
      },
    });

    for (const order of orders) {
      const label = this.orderLabel(order);
      await this.notifications.notifyRouted({
        type: NOTIFICATION_TYPES.NF_PENDING,
        title: 'NF pendente',
        body: `O pedido ${label} foi separado há mais de ${config.nfPendingHours}h sem NF emitida.`,
        link: '/app/expedicao/pedidos',
        entityId: order.id,
        entityType: 'order',
        label,
        priority: NOTIFICATION_PRIORITY.HIGH,
      });
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
      const label = this.orderLabel(order);
      await this.notifications.notifyRouted({
        type: NOTIFICATION_TYPES.ORDER_URGENT,
        title: 'Pedido urgente',
        body: `O pedido ${label} está marcado como urgente e ainda não iniciou separação.`,
        link: '/app/expedicao/pedidos',
        entityId: order.id,
        entityType: 'order',
        label,
        priority: NOTIFICATION_PRIORITY.URGENT,
      });
    }
  }

  private async checkLowStock(): Promise<void> {
    const config = await this.getConfig();
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
    ).filter(
      (product) =>
        product.stockQty < product.minStock ||
        product.stockQty < config.criticalStockThreshold,
    );

    for (const product of lowStock) {
      const label = `${product.name} (${product.sku})`;
      await this.notifications.notifyRouted({
        type: NOTIFICATION_TYPES.STOCK_LOW,
        title: 'Estoque baixo',
        body: `${label} está abaixo do mínimo (${product.stockQty}/${product.minStock}).`,
        link: '/app/estoque',
        entityId: product.id,
        entityType: 'product',
        label,
        priority: NOTIFICATION_PRIORITY.NORMAL,
      });
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
      const label = `${product.name} (${product.sku})`;
      await this.notifications.notifyRouted({
        type: NOTIFICATION_TYPES.STOCK_OUT,
        title: 'Estoque zerado',
        body: `${label} está zerado com pedido pendente.`,
        link: '/app/estoque',
        entityId: product.id,
        entityType: 'product',
        label,
        priority: NOTIFICATION_PRIORITY.HIGH,
      });
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
      const label =
        purchase.itemName ?? purchase.product?.name ?? purchase.sku ?? 'Item';
      await this.notifications.notifyRouted({
        type: NOTIFICATION_TYPES.PURCHASE_OVERDUE,
        title: 'Compra atrasada',
        body: `${label} passou da data prevista sem recebimento.`,
        link: '/app/compras',
        entityId: purchase.id,
        entityType: 'purchase',
        label,
        priority: NOTIFICATION_PRIORITY.HIGH,
      });
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
          },
        },
      },
    });

    for (const proposal of proposals) {
      const label = `${proposal.titulo} (${proposal.numero})`;
      await this.notifications.notifyRouted({
        type: NOTIFICATION_TYPES.CRM_PROPOSAL_EXPIRING,
        title: 'Proposta vencendo',
        body: `A proposta "${proposal.titulo}" (${proposal.numero}) do lead ${proposal.card.name} vence em até 2 dias.`,
        link: '/app/crm',
        entityId: proposal.id,
        entityType: 'crm_card',
        label,
        priority: NOTIFICATION_PRIORITY.HIGH,
      });
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
