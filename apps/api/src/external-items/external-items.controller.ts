import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { JwtGuard } from '../auth/jwt.guard';
import { RequirePermission } from '../common/permissions/require-permission.decorator';
import {
  CatalogSearchQueryDto,
  ExternalItemQueryDto,
} from './dto/external-item-query.dto';
import {
  CreateExternalItemDto,
  UpdateExternalItemDto,
} from './dto/external-item.dto';
import { ExternalItemsService } from './external-items.service';

@Controller('api/external-items')
@UseGuards(JwtGuard)
@RequirePermission('expedicao', 'ver_pedidos')
export class ExternalItemsController {
  constructor(private readonly items: ExternalItemsService) {}

  @Get()
  list(@Query() query: ExternalItemQueryDto) {
    return this.items.list(query);
  }

  @Get('catalog-search')
  searchCatalogs(@Query() query: CatalogSearchQueryDto) {
    return this.items.searchCatalogs(query.search);
  }

  @Post()
  @RequirePermission('expedicao', 'criar')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateExternalItemDto,
  ) {
    return this.items.create(user.id, dto);
  }

  @Patch(':id')
  @RequirePermission('expedicao', 'editar')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExternalItemDto,
  ) {
    return this.items.update(user.id, id, dto);
  }
}
