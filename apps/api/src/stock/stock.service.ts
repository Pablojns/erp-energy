import {

  BadRequestException,

  ConflictException,

  Injectable,

  NotFoundException,

} from '@nestjs/common';

import { Prisma, StockMovementType } from '@erp/database';

import type {

  CreateStockMovementDto,

  StockMovementQueryDto,

} from './dto/stock-movement.dto';

import { mapMovementKindToPrisma } from './dto/stock-movement.dto';

import { AuditService } from '../common/audit.service';

import { PrismaService } from '../prisma/prisma.service';



@Injectable()

export class StockService {

  constructor(

    private readonly prisma: PrismaService,

    private readonly audit: AuditService,

  ) {}



  async summary() {

    const [activeProducts, inactiveProducts, agg, lowStockRows] =

      await Promise.all([

        this.prisma.client.product.count({ where: { isActive: true } }),

        this.prisma.client.product.count({ where: { isActive: false } }),

        this.prisma.client.product.aggregate({

          where: { isActive: true },

          _sum: { stockQty: true },

        }),

        this.prisma.client.$queryRaw<[{ count: bigint }]>`

          SELECT COUNT(*)::bigint as count

          FROM "Product"

          WHERE "isActive" = true AND "stockQty" < "minStock"

        `,

      ]);



    const belowMin = Number(lowStockRows[0]?.count ?? BigInt(0));



    return {

      activeProducts,

      inactiveProducts,

      totalUnitsOnHand: agg._sum.stockQty ?? 0,

      skusBelowMinStock: belowMin,

    };

  }



  async listMovements(query: StockMovementQueryDto) {

    const page =

      query.page !== undefined && query.page > 0 ? query.page : 1;

    const pageSize =

      query.pageSize !== undefined &&

      query.pageSize > 0 &&

      query.pageSize <= 100

        ? query.pageSize

        : 20;



    const where: Prisma.StockMovementWhereInput = {};

    if (query.productId) {

      where.productId = query.productId;

    }

    if (query.movementType) {

      where.movementType = query.movementType;

    }



    const total = await this.prisma.client.stockMovement.count({ where });

    const rows = await this.prisma.client.stockMovement.findMany({

      where,

      orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }],

      skip: (page - 1) * pageSize,

      take: pageSize,

      include: {

        product: {

          select: {

            id: true,

            name: true,

            sku: true,

            internalCode: true,

          },

        },

        movedBy: {

          select: { id: true, name: true, email: true },

        },

      },

    });



    return {

      data: rows.map((m) => ({

        id: m.id,

        movementType: m.movementType,

        quantity: m.quantity,

        reference: m.reference,

        notes: m.notes,

        movementDate: m.movementDate.toISOString(),

        createdAt: m.createdAt.toISOString(),

        product: m.product,

        movedBy: m.movedBy,

      })),

      meta: {

        page,

        pageSize,

        total,

        totalPages: Math.max(1, Math.ceil(total / pageSize)),

      },

    };

  }



  async createMovement(

    userId: string,

    dto: CreateStockMovementDto,

  ) {

    const type = mapMovementKindToPrisma(dto.movementKind);



    if (type === StockMovementType.TRANSFER) {

      throw new BadRequestException(

        'Tipo de movimentação não permitido neste fluxo.',

      );

    }



    if (type === StockMovementType.ADJUSTMENT) {

      if (dto.quantity === 0) {

        throw new BadRequestException(

          'Em ajustes, informe uma quantidade diferente de zero (positiva para aumentar o saldo ou negativa para reduzir).',

        );

      }

    } else if (dto.quantity <= 0) {

      throw new BadRequestException(

        'Para este tipo de movimento, a quantidade deve ser um inteiro maior que zero.',

      );

    }



    const result = await this.prisma.client.$transaction(async (tx) => {

      const product = await tx.product.findUnique({

        where: { id: dto.productId },

      });



      if (!product) {

        throw new NotFoundException(

          'Produto não encontrado. Verifique o cadastro e tente novamente.',

        );

      }

      if (!product.isActive) {

        throw new BadRequestException(

          'Não é possível movimentar estoque de produto inativo.',

        );

      }



      const qty = dto.quantity;



      if (type === StockMovementType.INBOUND) {

        await tx.product.update({

          where: { id: dto.productId },

          data: { stockQty: { increment: qty } },

        });

      } else if (

        type === StockMovementType.OUTBOUND ||

        type === StockMovementType.RESERVE

      ) {

        const updated = await tx.product.updateMany({

          where: { id: dto.productId, stockQty: { gte: qty } },

          data: { stockQty: { decrement: qty } },

        });

        if (updated.count !== 1) {

          throw new ConflictException(

            'Saldo insuficiente no estoque para concluir a saída ou reserva.',

          );

        }

      } else if (type === StockMovementType.RESERVE_CANCEL) {

        await tx.product.update({

          where: { id: dto.productId },

          data: { stockQty: { increment: qty } },

        });

      } else if (
        type === StockMovementType.RESERVA ||
        type === StockMovementType.BAIXA_EXPEDICAO ||
        type === StockMovementType.SAIDA_EXPEDICAO
      ) {

        throw new BadRequestException(
          'Este tipo de movimentação é gerado apenas pela Expedição.',
        );

      } else if (type === StockMovementType.ADJUSTMENT) {

        if (qty > 0) {

          await tx.product.update({

            where: { id: dto.productId },

            data: { stockQty: { increment: qty } },

          });

        } else {

          const decrement = -qty;

          const updated = await tx.product.updateMany({

            where: { id: dto.productId, stockQty: { gte: decrement } },

            data: { stockQty: { decrement } },

          });

          if (updated.count !== 1) {

            throw new ConflictException(

              'Saldo insuficiente: o ajuste negativo deixaria o estoque abaixo de zero.',

            );

          }

        }

      }



      const movement = await tx.stockMovement.create({

        data: {

          productId: dto.productId,

          movementType: type,

          quantity: qty,

          reference: dto.reference?.trim() ? dto.reference.trim() : null,

          notes: dto.notes?.trim() ? dto.notes.trim() : null,

          movedById: userId,

          movementDate: dto.movementDate ?? new Date(),

        },

        include: {

          product: {

            select: {

              id: true,

              name: true,

              sku: true,

              internalCode: true,

              stockQty: true,

            },

          },

          movedBy: {

            select: { id: true, name: true, email: true },

          },

        },

      });



      return {

        id: movement.id,

        movementType: movement.movementType,

        movementKind: dto.movementKind,

        quantity: movement.quantity,

        reference: movement.reference,

        notes: movement.notes,

        movementDate: movement.movementDate.toISOString(),

        createdAt: movement.createdAt.toISOString(),

        product: movement.product,

        movedBy: movement.movedBy,

      };

    });



    await this.audit.log({

      userId,

      action: 'STOCK_MOVEMENT_CREATED',

      entity: 'StockMovement',

      entityId: result.id,

      changes: {

        productId: dto.productId,

        movementKind: dto.movementKind,

        movementType: result.movementType,

        quantity: dto.quantity,

        notes: dto.notes ?? null,

        reference: dto.reference ?? null,

        newStockQty: result.product.stockQty,

      },

    });



    return result;

  }

}

