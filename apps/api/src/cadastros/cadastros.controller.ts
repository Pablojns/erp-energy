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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AuditService } from '../common/audit.service';
import { RequirePermission } from '../common/permissions/require-permission.decorator';
import { CadastrosService } from './cadastros.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateNameCadastroDto } from './dto/create-name-cadastro.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { UpdateNameCadastroDto } from './dto/update-name-cadastro.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import {
  CreateCompanyEntityDto,
  UpdateCompanyEntityDto,
} from './dto/company-entity.dto';

@Controller('cadastros')
@UseGuards(JwtGuard)
export class CadastrosController {
  constructor(
    private readonly cadastros: CadastrosService,
    private readonly audit: AuditService,
  ) {}

  @Get('receivers')
  @RequirePermission('cadastros', 'ver_modulo')
  listReceivers() {
    return this.cadastros.listReceivers();
  }

  @Post('receivers')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('cadastros', 'criar')
  createReceiver(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateNameCadastroDto,
  ) {
    return this.cadastros.createReceiver(dto);
  }

  @Patch('receivers/:id')
  @RequirePermission('cadastros', 'editar')
  updateReceiver(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNameCadastroDto,
  ) {
    return this.cadastros.updateReceiver(id, dto);
  }

  @Patch('receivers/:id/toggle')
  @RequirePermission('cadastros', 'editar')
  toggleReceiver(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cadastros.toggleReceiver(id);
  }

  @Delete('receivers/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('cadastros', 'excluir')
  deleteReceiver(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cadastros.deleteReceiver(id);
  }

  @Get('unloading-points')
  @RequirePermission('cadastros', 'ver_modulo')
  listUnloadingPoints() {
    return this.cadastros.listUnloadingPoints();
  }

  @Post('unloading-points')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('cadastros', 'criar')
  createUnloadingPoint(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateNameCadastroDto,
  ) {
    return this.cadastros.createUnloadingPoint(dto);
  }

  @Patch('unloading-points/:id')
  @RequirePermission('cadastros', 'editar')
  updateUnloadingPoint(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNameCadastroDto,
  ) {
    return this.cadastros.updateUnloadingPoint(id, dto);
  }

  @Patch('unloading-points/:id/toggle')
  @RequirePermission('cadastros', 'editar')
  toggleUnloadingPoint(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cadastros.toggleUnloadingPoint(id);
  }

  @Delete('unloading-points/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('cadastros', 'excluir')
  deleteUnloadingPoint(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cadastros.deleteUnloadingPoint(id);
  }

  @Get('carriers')
  @RequirePermission('cadastros', 'ver_modulo')
  listCarriers() {
    return this.cadastros.listCarriers();
  }

  @Post('carriers')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('cadastros', 'criar')
  createCarrier(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateNameCadastroDto,
  ) {
    return this.cadastros.createCarrier(dto);
  }

  @Patch('carriers/:id')
  @RequirePermission('cadastros', 'editar')
  updateCarrier(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNameCadastroDto,
  ) {
    return this.cadastros.updateCarrier(id, dto);
  }

  @Patch('carriers/:id/toggle')
  @RequirePermission('cadastros', 'editar')
  toggleCarrier(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cadastros.toggleCarrier(id);
  }

  @Delete('carriers/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('cadastros', 'excluir')
  deleteCarrier(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cadastros.deleteCarrier(id);
  }

  @Get('suppliers')
  @RequirePermission('cadastros', 'ver_modulo')
  listSuppliers() {
    return this.cadastros.listSuppliers();
  }

  @Post('suppliers')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('cadastros', 'criar')
  createSupplier(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSupplierDto,
  ) {
    return this.cadastros.createSupplier(dto);
  }

  @Patch('suppliers/:id')
  @RequirePermission('cadastros', 'editar')
  updateSupplier(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.cadastros.updateSupplier(id, dto);
  }

  @Patch('suppliers/:id/toggle')
  @RequirePermission('cadastros', 'editar')
  toggleSupplier(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cadastros.toggleSupplier(id);
  }

  @Delete('suppliers/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('cadastros', 'excluir')
  deleteSupplier(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cadastros.deleteSupplier(id);
  }

  @Get('customers')
  @RequirePermission('cadastros', 'ver_modulo')
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
  @RequirePermission('cadastros', 'criar')
  createCustomer(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.cadastros.createCustomer(dto);
  }

  @Patch('customers/:id')
  @RequirePermission('cadastros', 'editar')
  updateCustomer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.cadastros.updateCustomer(id, dto);
  }

  @Patch('customers/:id/toggle')
  @RequirePermission('cadastros', 'editar')
  toggleCustomer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cadastros.toggleCustomer(id);
  }

  @Delete('customers/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('cadastros', 'excluir')
  deleteCustomer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cadastros.deleteCustomer(id);
  }

  @Get('company-entities')
  @RequirePermission('cadastros', 'ver_modulo')
  listCompanyEntities() {
    return this.cadastros.listCompanyEntities();
  }

  @Post('company-entities')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('cadastros', 'criar')
  createCompanyEntity(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCompanyEntityDto,
  ) {
    return this.cadastros.createCompanyEntity(dto);
  }

  @Patch('company-entities/:id')
  @RequirePermission('cadastros', 'editar')
  updateCompanyEntity(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyEntityDto,
  ) {
    return this.cadastros.updateCompanyEntity(id, dto);
  }

  @Patch('company-entities/:id/toggle')
  @RequirePermission('cadastros', 'editar')
  toggleCompanyEntity(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cadastros.toggleCompanyEntity(id);
  }
}
