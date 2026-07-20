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
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { ListPurchaseRequestsQueryDto } from './dto/list-purchase-requests-query.dto';
import { ResolvePurchaseRequestDto } from './dto/resolve-purchase-request.dto';
import { UpdatePurchaseRequestChegadaDto } from './dto/update-purchase-request-chegada.dto';
import { UpdatePurchaseRequestQuantityDto } from './dto/update-purchase-request-quantity.dto';
import { UpdatePurchaseRequestStatusDto } from './dto/update-purchase-request-status.dto';
import { PurchaseRequestService } from './purchase-request.service';

@Controller('api/compras')
@UseGuards(JwtGuard)
export class PurchaseRequestController {
  constructor(private readonly purchaseRequests: PurchaseRequestService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
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
  atualizarStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePurchaseRequestStatusDto,
  ) {
    return this.purchaseRequests.atualizarStatus(id, dto.status, user.id);
  }

  @Patch(':id/chegada')
  atualizarChegada(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseRequestChegadaDto,
  ) {
    return this.purchaseRequests.atualizarChegada(id, dto.expectedArrival);
  }

  @Patch(':id')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseRequestQuantityDto,
  ) {
    return this.purchaseRequests.atualizarQuantidade(id, dto);
  }

  @Post(':id/imagens')
  @HttpCode(HttpStatus.OK)
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
  removerImagem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.purchaseRequests.removerImagem(id, imageId);
  }

  @Patch(':id/quantidade')
  atualizarQuantidade(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseRequestQuantityDto,
  ) {
    return this.purchaseRequests.atualizarQuantidade(id, dto);
  }

  @Patch(':id/comprado')
  marcarComprado(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ResolvePurchaseRequestDto,
  ) {
    return this.purchaseRequests.marcarComprado(id, user.id, dto);
  }

  @Patch(':id/recusar')
  recusar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ResolvePurchaseRequestDto,
  ) {
    return this.purchaseRequests.recusar(id, user.id, dto);
  }

  @Delete(':id')
  deletar(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseRequests.deletar(id);
  }
}
