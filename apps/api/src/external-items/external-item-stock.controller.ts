import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { JwtGuard } from '../auth/jwt.guard';
import { RequirePermission } from '../common/permissions/require-permission.decorator';
import { ExternalItemQueryDto } from './dto/external-item-query.dto';
import {
  CreateExternalItemDto,
  ExternalItemStockMoveDto,
} from './dto/external-item.dto';
import { ExternalItemsService } from './external-items.service';

@Controller('api/estoque/venda-externa')
@UseGuards(JwtGuard)
@RequirePermission('estoque', 'ver_modulo')
export class ExternalItemStockController {
  constructor(private readonly items: ExternalItemsService) {}

  @Get()
  list(@Query() query: ExternalItemQueryDto) {
    return this.items.list(query);
  }

  @Post()
  @RequirePermission('estoque', 'criar')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateExternalItemDto,
  ) {
    return this.items.create(user.id, dto);
  }

  @Get(':id/movements')
  movements(@Param('id', ParseUUIDPipe) id: string) {
    return this.items.listMovements(id);
  }

  @Get(':id/orders')
  orders(@Param('id', ParseUUIDPipe) id: string) {
    return this.items.listOrders(id);
  }

  @Post(':id/stock')
  @RequirePermission('estoque', 'criar')
  move(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExternalItemStockMoveDto,
  ) {
    return this.items.moveStock(user.id, id, dto);
  }
}
