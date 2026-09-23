import { BadRequestException } from '@nestjs/common';
import { OrderSource, OrderStatus } from '@erp/database';
import { OrderService } from './order.service';

describe('OrderService.sendToPicking — seleção por item', () => {
  const userId = 'user-1';
  const orderId = 'order-1';
  const itemA = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    lineNumber: 1,
    sku: 'SKU-A',
    description: 'Caneta Plástica',
    productId: 'prod-a',
    quantity: 10,
    pickedQty: 0,
    invoicedQty: 0,
    reservedQuantity: 0,
    receiverName: null,
    unloadingPoint: null,
    product: { sku: 'SKU-A', name: 'Caneta Plástica' },
  };
  const itemB = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    lineNumber: 2,
    sku: 'SKU-B',
    description: 'Outro Item',
    productId: 'prod-b',
    quantity: 5,
    pickedQty: 0,
    invoicedQty: 0,
    reservedQuantity: 0,
    receiverName: null,
    unloadingPoint: null,
    product: { sku: 'SKU-B', name: 'Outro Item' },
  };

  function buildService(tx: Record<string, unknown>) {
    const prisma = {
      client: {
        $transaction: async (fn: (client: unknown) => Promise<unknown>) =>
          fn(tx),
      },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const carrierResolver = {};
    const saidaHojeSheets = {
      upsertRows: jest.fn().mockResolvedValue({ written: 0, updated: 0 }),
    };
    const svc = new OrderService(
      prisma as never,
      audit as never,
      carrierResolver as never,
      saidaHojeSheets as never,
    );
    jest.spyOn(svc as never, 'serializeOrder').mockImplementation(((o: unknown) =>
      o) as never);
    return { svc, audit, saidaHojeSheets };
  }

  function baseOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: orderId,
      code: 'PED-000001',
      status: OrderStatus.NOVO,
      source: OrderSource.SITE,
      externalOrderNumber: null,
      mercadoEletronicoNumber: null,
      shippedAt: null,
      invoicedAt: null,
      invoiceStatus: null,
      invoiceNumber: null,
      linkedOrderId: null,
      deliveryCnpj: '07.175.725/0010-50',
      unloadingPoint: 'PORTARIA',
      receiverName: 'FULANO',
      items: [itemA, itemB],
      ...overrides,
    };
  }

  function baseTx(order = baseOrder()) {
    const orderItemUpdates: Array<{ id: string; data: unknown }> = [];
    const tx = {
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        update: jest.fn().mockResolvedValue({
          ...order,
          status: OrderStatus.EM_SEPARACAO,
        }),
      },
      orderItem: {
        findMany: jest.fn().mockImplementation(
          ({ where }: { where: { orderId: string; id?: { in: string[] } } }) => {
            const all = order.items as typeof itemA[];
            const filtered = where.id?.in
              ? all.filter((it) => where.id!.in.includes(it.id))
              : all;
            return Promise.resolve(
              filtered.map((it) => ({
                id: it.id,
                quantity: it.quantity,
                invoicedQty: it.invoicedQty,
                mercadoEletronicoItemStatus: null,
              })),
            );
          },
        ),
        update: jest.fn().mockImplementation(
          ({ where, data }: { where: { id: string }; data: unknown }) => {
            orderItemUpdates.push({ id: where.id, data });
            return Promise.resolve({ id: where.id });
          },
        ),
      },
      orderInvoiceHistory: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    return { tx, orderItemUpdates };
  }

  it('rejeita itemIds que não pertencem ao pedido', async () => {
    const { tx } = baseTx();
    const { svc } = buildService(tx);
    await expect(
      svc.sendToPicking(orderId, userId, {
        itemIds: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reseta e envia só o item selecionado (outro item permanece intacto)', async () => {
    const { tx, orderItemUpdates } = baseTx();
    const { svc, audit, saidaHojeSheets } = buildService(tx);

    await svc.sendToPicking(orderId, userId, { itemIds: [itemA.id] });

    expect(tx.orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orderId,
          id: { in: [itemA.id] },
        }),
      }),
    );
    expect(orderItemUpdates.map((u) => u.id)).toEqual([itemA.id]);
    expect(orderItemUpdates.map((u) => u.id)).not.toContain(itemB.id);

    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OrderStatus.EM_SEPARACAO,
        }),
      }),
    );

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: expect.objectContaining({
          itemIds: [itemA.id],
          partialItems: true,
          to: OrderStatus.EM_SEPARACAO,
        }),
      }),
    );

    // defer microtask for fire-and-forget sheets write
    await Promise.resolve();
    expect(saidaHojeSheets.upsertRows).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          seq: itemA.lineNumber,
          quantidade: itemA.quantity,
        }),
      ]),
    );
    const rows = saidaHojeSheets.upsertRows.mock.calls[0][0] as Array<{
      seq: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].seq).toBe(itemA.lineNumber);
  });

  it('sem itemIds continua resetando o pedido inteiro (compatibilidade)', async () => {
    const { tx, orderItemUpdates } = baseTx();
    const { svc, audit } = buildService(tx);

    await svc.sendToPicking(orderId, userId);

    expect(tx.orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId },
      }),
    );
    expect(orderItemUpdates.map((u) => u.id).sort()).toEqual(
      [itemA.id, itemB.id].sort(),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: expect.objectContaining({
          itemIds: null,
          partialItems: false,
        }),
      }),
    );
  });

  it('WEG: StockReservation / analyzeAndReserve só para o item selecionado', async () => {
    const order = baseOrder({
      source: OrderSource.WEG_MERCADO_ELETRONICO,
      externalOrderNumber: '4518999999',
      code: 'PED-000099',
    });
    const { tx } = baseTx(order);
    Object.assign(tx, {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    });
    const { svc } = buildService(tx);
    const reserveSpy = jest
      .spyOn(svc as never, 'flexibleAnalyzeAndReserve')
      .mockResolvedValue(undefined as never);

    await svc.sendToPicking(orderId, userId, { itemIds: [itemA.id] });

    expect(reserveSpy).toHaveBeenCalledTimes(1);
    const reservedLines = reserveSpy.mock.calls[0][4] as Array<{ id: string }>;
    expect(reservedLines).toHaveLength(1);
    expect(reservedLines[0].id).toBe(itemA.id);
    expect(reservedLines.map((l) => l.id)).not.toContain(itemB.id);
  });
});
