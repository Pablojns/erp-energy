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
  Query,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { RequirePermission } from '../common/permissions/require-permission.decorator';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { CreatePurchaseStageDto } from './dto/create-purchase-stage.dto';
import { ListPurchaseRequestsQueryDto } from './dto/list-purchase-requests-query.dto';
import { ResolvePurchaseRequestDto } from './dto/resolve-purchase-request.dto';
import { UpdatePurchaseRequestChegadaDto } from './dto/update-purchase-request-chegada.dto';
import { UpdatePurchaseRequestQuantityDto } from './dto/update-purchase-request-quantity.dto';
import { UpdatePurchaseRequestStatusDto } from './dto/update-purchase-request-status.dto';
import { UpdatePurchaseStageDto } from './dto/update-purchase-stage.dto';
import { PurchaseRequestService } from './purchase-request.service';
import { PurchaseStageService } from './purchase-stage.service';

@Controller('api/compras')
@UseGuards(JwtGuard)
@RequirePermission('compras', 'ver_modulo')
export class PurchaseRequestController {
  constructor(
    private readonly purchaseRequests: PurchaseRequestService,
    private readonly stages: PurchaseStageService,
  ) {}

  // As rotas de etapas ficam antes das rotas ':id' para não colidirem com o
  // ParseUUIDPipe (que rejeitaria o literal "stages" como id).

  @Get('stages')
  listarStages() {
    return this.stages.listar();
  }

  @Post('stages')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('compras', 'criar')
  criarStage(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePurchaseStageDto,
  ) {
    this.assertAdmin(user);
    return this.stages.criar(dto);
  }

  @Patch('stages/:stageId')
  @RequirePermission('compras', 'editar')
  atualizarStage(
    @CurrentUser() user: AuthUser,
    @Param('stageId') stageId: string,
    @Body() dto: UpdatePurchaseStageDto,
  ) {
    this.assertAdmin(user);
    return this.stages.atualizar(stageId, dto);
  }

  @Delete('stages/:stageId')
  @RequirePermission('compras', 'excluir')
  deletarStage(
    @CurrentUser() user: AuthUser,
    @Param('stageId') stageId: string,
  ) {
    this.assertAdmin(user);
    return this.stages.deletar(stageId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('compras', 'criar')
  @UseInterceptors(
    FilesInterceptor('images', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  criar(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePurchaseRequestDto,
    @UploadedFiles() files?: Express.Multer.File[],
    @Query('force') force?: string,
  ) {
    return this.purchaseRequests.criar(
      user.id,
      dto,
      files,
      force === 'true',
    );
  }

  @Get()
  listar(@Query() query: ListPurchaseRequestsQueryDto) {
    return this.purchaseRequests.listar(query);
  }

  @Get(':id/imagem/:imageId')
  async buscarImagem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, contentType, contentLength, filename } =
      await this.purchaseRequests.buscarImagem(id, imageId);

    // Content-Type sem charset — charset=utf-8 corrompe binários no browser.
    const safeType = contentType.split(';')[0]?.trim() || 'application/octet-stream';
    res.set({
      'Content-Type': safeType,
      'Content-Length': String(contentLength),
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, max-age=300',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });

    return new StreamableFile(buffer, {
      type: safeType,
      disposition: `inline; filename="${filename}"`,
      length: contentLength,
    });
  }

  @Get(':id')
  buscarPorId(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseRequests.buscarPorId(id);
  }

  @Patch(':id/status')
  @RequirePermission('compras', 'editar')
  atualizarStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePurchaseRequestStatusDto,
  ) {
    return this.purchaseRequests.atualizarStatus(id, dto.status, user.id, {
      purchaseValue: dto.purchaseValue,
      purchasedAt: dto.purchasedAt,
      refusalReason: dto.refusalReason,
    });
  }

  @Patch(':id/chegada')
  @RequirePermission('compras', 'editar')
  atualizarChegada(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseRequestChegadaDto,
  ) {
    return this.purchaseRequests.atualizarChegada(id, dto.expectedArrival);
  }

  @Patch(':id')
  @RequirePermission('compras', 'editar')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePurchaseRequestQuantityDto,
  ) {
    return this.purchaseRequests.atualizarQuantidade(id, dto, user.id);
  }

  @Post(':id/imagens')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('compras', 'editar')
  @UseInterceptors(
    FilesInterceptor('images', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  adicionarImagens(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.purchaseRequests.adicionarImagens(id, files);
  }

  @Delete(':id/imagens/:imageId')
  @RequirePermission('compras', 'editar')
  removerImagem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.purchaseRequests.removerImagem(id, imageId);
  }

  @Patch(':id/quantidade')
  @RequirePermission('compras', 'editar')
  atualizarQuantidade(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePurchaseRequestQuantityDto,
  ) {
    return this.purchaseRequests.atualizarQuantidade(id, dto, user.id);
  }

  @Patch(':id/comprado')
  @RequirePermission('compras', 'editar')
  marcarComprado(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ResolvePurchaseRequestDto,
  ) {
    return this.purchaseRequests.marcarComprado(id, user.id, dto);
  }

  @Patch(':id/recusar')
  @RequirePermission('compras', 'editar')
  recusar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ResolvePurchaseRequestDto,
  ) {
    return this.purchaseRequests.recusar(id, user.id, dto);
  }

  @Delete(':id')
  @RequirePermission('compras', 'excluir')
  deletar(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseRequests.deletar(id);
  }

  private assertAdmin(user: AuthUser) {
    if (!user.roles.includes('ADMIN')) {
      throw new ForbiddenException(
        'Somente administradores podem gerenciar as etapas de compras.',
      );
    }
  }
}
