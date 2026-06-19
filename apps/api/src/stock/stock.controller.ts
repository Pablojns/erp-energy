import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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

  @Delete('movements/:id')
  @HttpCode(HttpStatus.OK)
  deleteMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    if (!user.roles.includes('ADMIN')) {
      throw new ForbiddenException(
        'Apenas administradores podem excluir movimentações.',
      );
    }
    return this.stockService.deleteMovement(user.id, id);
  }
}
