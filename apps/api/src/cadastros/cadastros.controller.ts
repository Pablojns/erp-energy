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
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AuditService } from '../common/audit.service';
import { RequirePermission } from '../common/permissions/require-permission.decorator';
import { PermissionsModule } from '../common/permissions/permissions.module';
import { CadastrosService } from './cadastros.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateNameCadastroDto } from './dto/create-name-cadastro.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { UpdateNameCadastroDto } from './dto/update-name-cadastro.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Controller('cadastros')
@UseGuards(JwtGuard)
export class CadastrosController {
  constructor(
    private readonly cadastros: CadastrosService,
    private readonly audit: AuditService,
  ) {}

  private assertAdmin(user: AuthUser) {
    if (!user.roles.includes('ADMIN')) {
      throw new ForbiddenException('Acesso restrito a administradores.');
    }
  }

  @Get('receivers')
  @RequirePermission('cadastros', 'ver_cadastros')
  listReceivers() {
    return this.cadastros.listReceivers();
  }

  @Post('receivers')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('cadastros', 'criar_cadastro')
  createReceiver(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateNameCadastroDto,
  ) {
    this.assertAdmin(user);
    return this.cadastros.createReceiver(dto);
  }

  @Patch('receivers/:id')
  updateReceiver(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNameCadastroDto,
  ) {
    this.assertAdmin(user);
    return this.cadastros.updateReceiver(id, dto);
  }

  @Patch('receivers/:id/toggle')
  toggleReceiver(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.assertAdmin(user);
    return this.cadastros.toggleReceiver(id);
  }

  @Delete('receivers/:id')
  @HttpCode(HttpStatus.OK)
  deleteReceiver(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.assertAdmin(user);
    return this.cadastros.deleteReceiver(id);
  }

  @Get('unloading-points')
  @RequirePermission('cadastros', 'ver_cadastros')
  listUnloadingPoints() {
    return this.cadastros.listUnloadingPoints();
  }

  @Post('unloading-points')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('cadastros', 'criar_cadastro')
  createUnloadingPoint(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateNameCadastroDto,
  ) {
    this.assertAdmin(user);
    return this.cadastros.createUnloadingPoint(dto);
  }

  @Patch('unloading-points/:id')
  updateUnloadingPoint(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNameCadastroDto,
  ) {
    this.assertAdmin(user);
    return this.cadastros.updateUnloadingPoint(id, dto);
  }

  @Patch('unloading-points/:id/toggle')
  toggleUnloadingPoint(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.assertAdmin(user);
    return this.cadastros.toggleUnloadingPoint(id);
  }

  @Delete('unloading-points/:id')
  @HttpCode(HttpStatus.OK)
  deleteUnloadingPoint(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.assertAdmin(user);
    return this.cadastros.deleteUnloadingPoint(id);
  }

  @Get('carriers')
  @RequirePermission('cadastros', 'ver_cadastros')
  listCarriers() {
    return this.cadastros.listCarriers();
  }

  @Post('carriers')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('cadastros', 'criar_cadastro')
  createCarrier(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateNameCadastroDto,
  ) {
    this.assertAdmin(user);
    return this.cadastros.createCarrier(dto);
  }

  @Patch('carriers/:id')
  updateCarrier(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNameCadastroDto,
  ) {
    this.assertAdmin(user);
    return this.cadastros.updateCarrier(id, dto);
  }

  @Patch('carriers/:id/toggle')
  toggleCarrier(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.assertAdmin(user);
    return this.cadastros.toggleCarrier(id);
  }

  @Delete('carriers/:id')
  @HttpCode(HttpStatus.OK)
  deleteCarrier(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.assertAdmin(user);
    return this.cadastros.deleteCarrier(id);
  }

  @Get('suppliers')
  @RequirePermission('cadastros', 'ver_cadastros')
  listSuppliers() {
    return this.cadastros.listSuppliers();
  }

  @Post('suppliers')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('cadastros', 'criar_cadastro')
  createSupplier(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSupplierDto,
  ) {
    this.assertAdmin(user);
    return this.cadastros.createSupplier(dto);
  }

  @Patch('suppliers/:id')
  updateSupplier(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    this.assertAdmin(user);
    return this.cadastros.updateSupplier(id, dto);
  }

  @Patch('suppliers/:id/toggle')
  toggleSupplier(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.assertAdmin(user);
    return this.cadastros.toggleSupplier(id);
  }

  @Delete('suppliers/:id')
  @HttpCode(HttpStatus.OK)
  deleteSupplier(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.assertAdmin(user);
    return this.cadastros.deleteSupplier(id);
  }

  @Get('customers')
  @RequirePermission('cadastros', 'ver_cadastros')
  async listCustomers(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const result = await this.cadastros.listCustomers();
    await this.audit.logDataAccess(
      user.id,
      'Customer',
      'list',
      'DATA_ACCESS',
      req.ip,
    );
    return result;
  }

  @Post('customers')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('cadastros', 'criar_cadastro')
  createCustomer(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCustomerDto,
  ) {
    this.assertAdmin(user);
    return this.cadastros.createCustomer(dto);
  }

  @Patch('customers/:id')
  updateCustomer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    this.assertAdmin(user);
    return this.cadastros.updateCustomer(id, dto);
  }

  @Patch('customers/:id/toggle')
  toggleCustomer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.assertAdmin(user);
    return this.cadastros.toggleCustomer(id);
  }

  @Delete('customers/:id')
  @HttpCode(HttpStatus.OK)
  deleteCustomer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.assertAdmin(user);
    return this.cadastros.deleteCustomer(id);
  }
}
