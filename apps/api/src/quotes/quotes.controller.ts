import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { JwtGuard } from '../auth/jwt.guard';
import { RequirePermission } from '../common/permissions/require-permission.decorator';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { CreateQuoteItemDto } from './dto/create-quote-item.dto';
import { ListCatalogQueryDto } from './dto/list-catalog-query.dto';
import { ListQuotesQueryDto } from './dto/list-quotes-query.dto';
import {
  CreateQuoteProposalDto,
  SendQuoteProposalEmailDto,
} from './dto/quote-proposal.dto';
import { QuoteDashboardQueryDto } from './dto/quote-dashboard-query.dto';
import { SearchPeopleQueryDto } from './dto/search-people-query.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { UpdateQuoteItemDto } from './dto/update-quote-item.dto';
import { UpdateQuoteStatusDto } from './dto/update-quote-status.dto';
import { QuoteProposalService } from './quote-proposal.service';
import { QuotesService } from './quotes.service';
import { SpotIntegrationService } from './spot-integration.service';
import { XbzIntegrationService } from './xbz-integration.service';

@Controller('api/quotes')
@UseGuards(JwtGuard)
export class QuotesController {
  constructor(
    private readonly quotes: QuotesService,
    private readonly xbz: XbzIntegrationService,
    private readonly spot: SpotIntegrationService,
    private readonly proposals: QuoteProposalService,
  ) {}

  @Get()
  @RequirePermission('crm', 'ver_modulo')
  list(
    @Query() query: ListQuotesQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotes.findMany(query, user);
  }

  @Get('dashboard')
  @RequirePermission('crm', 'ver_modulo')
  dashboard(@Query() query: QuoteDashboardQueryDto) {
    return this.quotes.getDashboard(query.period);
  }

  @Get('people-search')
  @RequirePermission('crm', 'ver_modulo')
  searchPeople(@Query() query: SearchPeopleQueryDto) {
    return this.quotes.searchPeople(query.q);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('crm', 'criar')
  create(@Body() dto: CreateQuoteDto, @CurrentUser() user: AuthUser) {
    return this.quotes.create(dto, user);
  }

  @Get('catalog')
  @RequirePermission('crm', 'ver_modulo')
  listCatalog(@Query() query: ListCatalogQueryDto) {
    return this.xbz.listCatalog(query);
  }

  @Get('catalog/engraving-options')
  @RequirePermission('crm', 'ver_modulo')
  listCatalogEngravingOptions(@Query('productSku') productSku?: string) {
    return this.spot.listEngravingOptions(String(productSku ?? '').trim());
  }

  @Post('catalog/sync')
  @RequirePermission('crm', 'editar')
  syncCatalog() {
    return this.xbz.syncCatalog();
  }

  @Post('catalog/sync-spot')
  @RequirePermission('crm', 'editar')
  syncSpotCatalog() {
    return this.spot.syncCatalog();
  }

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('crm', 'criar')
  duplicate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.quotes.duplicate(id, user);
  }

  @Get(':id/proposals')
  @RequirePermission('crm', 'ver_modulo')
  listProposals(@Param('id') id: string) {
    return this.proposals.list(id);
  }

  @Post(':id/proposals')
  @RequirePermission('crm', 'criar')
  async createProposal(
    @Param('id') id: string,
    @Body() dto: CreateQuoteProposalDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.proposals.create(id, {
      createdBy: user?.name || user?.email || null,
      contactName: dto.contactName,
      contactEmail: dto.contactEmail,
      validityDays: dto.validityDays,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'X-Proposal-Id': result.proposal.id,
    });
    return new StreamableFile(result.pdf);
  }

  @Get(':id/proposals/:proposalId/pdf')
  @RequirePermission('crm', 'ver_modulo')
  async proposalPdf(
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.proposals.getPdf(id, proposalId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
    });
    return new StreamableFile(result.pdf);
  }

  @Post(':id/proposals/:proposalId/send-email')
  @RequirePermission('crm', 'editar')
  sendProposalEmail(
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
    @Body() dto: SendQuoteProposalEmailDto,
  ) {
    return this.proposals.sendEmail(id, proposalId, {
      to: dto.to,
      contactName: dto.contactName,
    });
  }

  @Post(':id/convert-to-order')
  @RequirePermission('crm', 'editar')
  convertToOrder(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotes.convertToOrder(id, user.id);
  }

  @Post(':id/items')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('crm', 'criar')
  addItem(
    @Param('id') id: string,
    @Body() dto: CreateQuoteItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotes.addItem(id, dto, user);
  }

  @Patch(':id/items/:itemId')
  @RequirePermission('crm', 'editar')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateQuoteItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotes.updateItem(id, itemId, dto, user);
  }

  @Delete(':id/items/:itemId')
  @RequirePermission('crm', 'excluir')
  removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotes.removeItem(id, itemId, user);
  }

  @Get(':id')
  @RequirePermission('crm', 'ver_modulo')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.quotes.findOne(id, user);
  }

  @Patch(':id')
  @RequirePermission('crm', 'editar')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateQuoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotes.update(id, dto, user);
  }

  @Patch(':id/status')
  @RequirePermission('crm', 'editar')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateQuoteStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotes.updateStatus(id, dto.status, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('crm', 'excluir')
  remove(@Param('id') id: string) {
    return this.quotes.remove(id);
  }
}
