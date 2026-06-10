import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { JwtGuard } from '../auth/jwt.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateWegOrderDto } from './dto/create-wego-order.dto';
import { AttachInvoiceDto } from './dto/attach-invoice.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { UpdateOrderItemPickedDto } from './dto/update-order-item-picked.dto';
import { UpdateOrderPriorityDto } from './dto/update-order-priority.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderService } from './order.service';

function collectValidationMessages(errors: ValidationError[]): string[] {
  const out: string[] = [];
  for (const e of errors) {
    if (e.constraints) {
      out.push(...Object.values(e.constraints));
    }
    if (e.children?.length) {
      out.push(...collectValidationMessages(e.children));
    }
  }
  return out;
}

@Controller('orders')
@UseGuards(JwtGuard)
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  /** Itens WEG trazem lineNumber; pedido manual usa productId nos itens. */
  private static looksLikeWegCreate(body: unknown): boolean {
    if (!body || typeof body !== 'object') return false;
    const items = (body as { items?: unknown }).items;
    if (!Array.isArray(items) || items.length === 0) return false;
    const first = items[0];
    if (!first || typeof first !== 'object') return false;
    return 'lineNumber' in first;
  }

  @Get('filters/cnpjs')
  filterCnpjs(@Query('search') search?: string) {
    return this.orders.filterCnpjs(search);
  }

  @Get('filters/receivers')
  filterReceivers(@Query('search') search?: string) {
    return this.orders.filterReceivers(search);
  }

  @Get('filters/unloading-points')
  filterUnloadingPoints(@Query('search') search?: string) {
    return this.orders.filterUnloadingPoints(search);
  }

  @Get('filters/skus')
  filterSkus(@Query('search') search?: string) {
    return this.orders.filterSkus(search);
  }

  /** KPIs da expedição — mesmos filtros da listagem (sem paginação). */
  @Get('summary')
  summary(@Query() query: OrderQueryDto) {
    return this.orders.summary(query);
  }

  @Post('weg')
  @HttpCode(HttpStatus.CREATED)
  createWeg(@CurrentUser() user: AuthUser, @Body() dto: CreateWegOrderDto) {
    return this.orders.createWeg(user.id, dto);
  }

  /**
   * Cria pedido manual (itens com productId) ou pedido WEG de teste (itens com lineNumber),
   * delegando para o fluxo adequado. Rotas específicas (`POST /orders/weg`) continuam válidas.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthUser, @Body() body: object) {
    if (OrderController.looksLikeWegCreate(body)) {
      const dto = plainToInstance(CreateWegOrderDto, body);
      const errs = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      if (errs.length) {
        const msg = collectValidationMessages(errs).join(' ');
        throw new BadRequestException(msg || 'Payload WEG inválido.');
      }
      return this.orders.createWeg(user.id, dto);
    }

    const dto = plainToInstance(CreateOrderDto, body);
    const errs = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errs.length) {
      const msg = collectValidationMessages(errs).join(' ');
      throw new BadRequestException(msg || 'Payload do pedido inválido.');
    }
    return this.orders.create(user.id, dto);
  }

  @Get()
  findAll(@Query() query: OrderQueryDto) {
    return this.orders.findMany(query);
  }

  @Patch(':id/priority')
  updatePriority(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateOrderPriorityDto,
  ) {
    return this.orders.updatePriority(id, user.id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.updateStatus(id, user.id, dto);
  }

  /**
   * Ajusta quantidade separada por linha (pedido em EM_SEPARACAO).
   * `pickedQty` não pode exceder a quantidade solicitada na linha.
   */
  @Patch(':orderId/items/:itemId/picked-qty')
  @HttpCode(HttpStatus.OK)
  async updateItemPickedQty(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: object,
  ) {
    const dto = plainToInstance(UpdateOrderItemPickedDto, body);
    const errs = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errs.length) {
      const msg = collectValidationMessages(errs).join(' ');
      throw new BadRequestException(msg || 'Payload inválido.');
    }
    return this.orders.updateItemPickedQty(orderId, itemId, user.id, dto);
  }

  @Post(':id/reserve')
  @HttpCode(HttpStatus.OK)
  reserve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.orders.reserve(id, user.id);
  }

  @Post(':id/send-to-picking')
  @HttpCode(HttpStatus.OK)
  sendToPicking(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.sendToPicking(id, user.id);
  }

  @Post(':id/mark-picked')
  @HttpCode(HttpStatus.OK)
  markPicked(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.markPicked(id, user.id);
  }

  @Post(':id/attach-invoice')
  @HttpCode(HttpStatus.OK)
  attachInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AttachInvoiceDto,
  ) {
    return this.orders.attachInvoice(id, user.id, dto);
  }

  @Post(':id/generate-exit')
  @HttpCode(HttpStatus.OK)
  generateExit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AttachInvoiceDto,
  ) {
    return this.orders.generateExitFromInvoice(id, user.id, dto);
  }

  @Post(':id/finalize-expedition')
  @HttpCode(HttpStatus.OK)
  finalizeExpedition(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.finalizeExpedition(id, user.id);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.findOne(id);
  }
}
