import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductService } from './product.service';

@Controller('products')
@UseGuards(JwtGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProductDto,
  ) {
    return this.productService.create(user.id, dto);
  }

  @Get()
  findAll(@Query() query: ProductQueryDto) {
    return this.productService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productService.findOne(id);
  }

  @Patch(':id/reactivate')
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.productService.reactivate(id, user.id);
  }

  @Patch(':id')
  @RequirePermission('estoque', 'editar_produto')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productService.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    if (!user.roles.includes('ADMIN')) {
      throw new ForbiddenException(
        'Apenas administradores podem excluir produtos.',
      );
    }
    return this.productService.softDelete(id, user.id);
  }
}
