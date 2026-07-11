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
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { RequirePermission } from '../common/permissions/require-permission.decorator';
import { CrmService } from './crm.service';
import { CreateCrmCardDto } from './dto/create-crm-card.dto';
import { CreateCrmChannelDto } from './dto/create-crm-channel.dto';
import { CreateCrmFunilDto } from './dto/create-crm-funil.dto';
import { CreateCrmStatusDto } from './dto/create-crm-status.dto';
import { CrmDashboardQueryDto } from './dto/crm-dashboard-query.dto';
import { MoveCrmCardDto } from './dto/move-crm-card.dto';
import { UpdateCrmCardDto } from './dto/update-crm-card.dto';
import { UpdateCrmChannelDto } from './dto/update-crm-channel.dto';
import { UpdateCrmFunilDto } from './dto/update-crm-funil.dto';
import { UpdateCrmStatusDto } from './dto/update-crm-status.dto';
import { UpsertCrmTouchpointsDto } from './dto/upsert-crm-touchpoints.dto';

@Controller('api/crm')
@UseGuards(JwtGuard)
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('status')
  @RequirePermission('crm', 'ver_modulo')
  listStatuses() {
    return this.crm.listStatuses();
  }

  @Post('status')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('crm', 'ver_modulo')
  createStatus(@Body() dto: CreateCrmStatusDto) {
    return this.crm.createStatus(dto);
  }

  @Patch('status/:id')
  @RequirePermission('crm', 'ver_modulo')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateCrmStatusDto) {
    return this.crm.updateStatus(id, dto);
  }

  @Delete('status/:id')
  @RequirePermission('crm', 'ver_modulo')
  deleteStatus(@Param('id') id: string) {
    return this.crm.deleteStatus(id);
  }

  @Get('channels')
  @RequirePermission('crm', 'ver_modulo')
  listChannels() {
    return this.crm.listChannels();
  }

  @Post('channels')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('crm', 'ver_modulo')
  createChannel(@Body() dto: CreateCrmChannelDto) {
    return this.crm.createChannel(dto);
  }

  @Patch('channels/:id')
  @RequirePermission('crm', 'ver_modulo')
  updateChannel(@Param('id') id: string, @Body() dto: UpdateCrmChannelDto) {
    return this.crm.updateChannel(id, dto);
  }

  @Delete('channels/:id')
  @RequirePermission('crm', 'ver_modulo')
  deleteChannel(@Param('id') id: string) {
    return this.crm.deleteChannel(id);
  }

  @Get('funis')
  @RequirePermission('crm', 'ver_modulo')
  listFunis() {
    return this.crm.listFunis();
  }

  @Post('funis')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('crm', 'ver_modulo')
  createFunil(@Body() dto: CreateCrmFunilDto) {
    return this.crm.createFunil(dto);
  }

  @Patch('funis/:id')
  @RequirePermission('crm', 'ver_modulo')
  updateFunil(@Param('id') id: string, @Body() dto: UpdateCrmFunilDto) {
    return this.crm.updateFunil(id, dto);
  }

  @Delete('funis/:id')
  @RequirePermission('crm', 'ver_modulo')
  deleteFunil(@Param('id') id: string) {
    return this.crm.deleteFunil(id);
  }

  @Get('cards')
  @RequirePermission('crm', 'ver_modulo')
  listCards() {
    return this.crm.listCards();
  }

  @Get('cards/:id')
  @RequirePermission('crm', 'ver_modulo')
  getCard(@Param('id') id: string) {
    return this.crm.getCard(id);
  }

  @Post('cards')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('crm', 'ver_modulo')
  createCard(@Body() dto: CreateCrmCardDto) {
    return this.crm.createCard(dto);
  }

  @Patch('cards/:id')
  @RequirePermission('crm', 'ver_modulo')
  updateCard(@Param('id') id: string, @Body() dto: UpdateCrmCardDto) {
    return this.crm.updateCard(id, dto);
  }

  @Delete('cards/:id')
  @RequirePermission('crm', 'ver_modulo')
  deleteCard(@Param('id') id: string) {
    return this.crm.deleteCard(id);
  }

  @Patch('cards/:id/mover')
  @RequirePermission('crm', 'ver_modulo')
  moveCard(@Param('id') id: string, @Body() dto: MoveCrmCardDto) {
    return this.crm.moveCard(id, dto.funilId);
  }

  @Post('cards/:id/touchpoints')
  @RequirePermission('crm', 'ver_modulo')
  upsertTouchpoints(
    @Param('id') id: string,
    @Body() dto: UpsertCrmTouchpointsDto,
  ) {
    return this.crm.upsertTouchpoints(id, dto);
  }

  @Get('dashboard')
  @RequirePermission('crm', 'ver_modulo')
  dashboard(@Query() query: CrmDashboardQueryDto) {
    return this.crm.getDashboard(query);
  }
}
