import {
  Body,
  Controller,
  Delete,
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
import { JwtGuard } from '../auth/jwt.guard';
import { RequirePermission } from '../common/permissions/require-permission.decorator';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { ListProductCategoryQueryDto } from './dto/list-product-category-query.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { ProductCategoryService } from './product-category.service';

@Controller('product-categories')
@UseGuards(JwtGuard)
export class ProductCategoryController {
  constructor(private readonly categories: ProductCategoryService) {}

  @Get()
  list(@Query() query: ListProductCategoryQueryDto) {
    return this.categories.list(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('estoque', 'criar')
  create(@Body() dto: CreateProductCategoryDto) {
    return this.categories.create(dto);
  }

  @Patch(':id')
  @RequirePermission('estoque', 'editar')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductCategoryDto,
  ) {
    return this.categories.update(id, dto);
  }

  /** Soft delete: marca categoria como inativa. */
  @Delete(':id')
  @RequirePermission('estoque', 'excluir')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.deactivate(id);
  }
}
