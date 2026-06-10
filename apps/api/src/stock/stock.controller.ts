import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { StockService } from './stock.service';

@Controller('stock')
@UseGuards(JwtGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get('summary')
  summary() {
    return this.stockService.summary();
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
}
