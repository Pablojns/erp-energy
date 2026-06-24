import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrderStatus } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';
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
      await this.checkLowStock();
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
      const link = `order:${order.id}`;
      const type = 'pedido_atrasado';
      if (await this.notifications.hasRecentDuplicate(type, link)) {
        continue;
      }

      const label = order.externalOrderNumber ?? order.code;
      await this.notifications.createForPermission(
        'expedicao',
        'ver_pedidos',
        'Pedido atrasado',
        `O pedido ${label} está com entrega prevista vencida.`,
        type,
        link,
      );
    }
  }

  private async checkLowStock(): Promise<void> {
    const products = await this.prisma.client.product.findMany({
      where: {
        isActive: true,
        stockQty: { lte: 5 },
      },
      select: {
        id: true,
        sku: true,
        name: true,
        stockQty: true,
      },
    });

    for (const product of products) {
      const link = `product:${product.id}`;
      const type = 'estoque_baixo';
      if (await this.notifications.hasRecentDuplicate(type, link)) {
        continue;
      }

      await this.notifications.createForPermission(
        'estoque',
        'ver_movimentacoes',
        'Estoque baixo',
        `Produto ${product.sku} (${product.name}) com ${product.stockQty} un. em estoque.`,
        type,
        link,
      );
    }
  }

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

      const label = order.externalOrderNumber ?? order.code;
      await this.notifications.createForPermission(
        'expedicao',
        'emitir_nf',
        'Pedido sem NF',
        `O pedido ${label} está finalizado há mais de 3 dias sem nota fiscal.`,
        type,
        link,
      );
    }
  }
}
