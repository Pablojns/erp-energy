import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import {
  CreateStockMovementDto,
  StockMovementQueryDto,
} from './dto/stock-movement.dto';
import { StockSummaryQueryDto } from './dto/stock-summary.dto';
import { StockService } from './stock.service';

@Controller('stock')
@UseGuards(JwtGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get('summary')
  summary(@Query() query: StockSummaryQueryDto) {
    return this.stockService.summary(query);
  }

  @Get('movements/summary')
  movementsSummary(@Query() query: StockMovementQueryDto) {
    return this.stockService.movementsSummary(query);
  }

  @Get('movements')
  @RequirePermission('estoque', 'ver_movimentacoes')
  listMovements(@Query() query: StockMovementQueryDto) {
    return this.stockService.listMovements(query);
  }

  @Post('movements')
  @HttpCode(HttpStatus.CREATED)
  createMovement(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStockMovementDto,
  ) {
    return this.stockService.createMovement(user.id, dto);
  }

  @Get('movements/:id/detail')
  @RequirePermission('estoque', 'ver_movimentacoes')
  getMovementDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.stockService.getMovementDetail(id);
  }

  @Delete('movements/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('estoque', 'deletar_movimentacao')
  async deleteMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const { wouldCauseNegativeBalance } =
      await this.stockService.evaluateMovementDelete(id);

    const isAdmin = user.roles.includes('ADMIN');

    if (wouldCauseNegativeBalance && !isAdmin) {
      throw new ConflictException(
        'Não é possível reverter entrada do pedido: saldo atual ficaria negativo.',
      );
    }

    return this.stockService.deleteMovement(user.id, id, {
      allowNegativeBalance: isAdmin && wouldCauseNegativeBalance,
    });
  }
}
