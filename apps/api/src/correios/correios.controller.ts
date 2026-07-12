import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CorreiosService } from './correios.service';

@UseGuards(JwtGuard)
@Controller('correios')
export class CorreiosController {
  constructor(private readonly correiosService: CorreiosService) {}

  /** GET /correios/remetente-padrao — dados do remetente padrão (Energy Brands) */
  @Get('remetente-padrao')
  getRemetentePadrao() {
    return this.correiosService.getRemetentePadrao();
  }

  /** GET /correios/etiquetas — histórico de etiquetas emitidas */
  @Get('etiquetas')
  listEtiquetas() {
    return this.correiosService.listEtiquetas();
  }

  /** DELETE /correios/etiquetas/:id — remove do histórico local */
  @Delete('etiquetas/:id')
  excluirEtiqueta(@Param('id') id: string) {
    return this.correiosService.excluirEtiqueta(id);
  }

  /** GET /correios/cep/01310100 */
  @Get('cep/:cep')
  buscarCep(@Param('cep') cep: string) {
    return this.correiosService.buscarCep(cep);
  }

  /** GET /correios/prazo/03220?cepOrigem=01310100&cepDestino=20040020 */
  @Get('prazo/:coProduto')
  consultarPrazo(
    @Param('coProduto') coProduto: string,
    @Query('cepOrigem') cepOrigem: string,
    @Query('cepDestino') cepDestino: string,
  ) {
    return this.correiosService.consultarPrazo(coProduto, cepOrigem, cepDestino);
  }

  /**
   * GET /correios/preco/03220
   *   ?cepOrigem=01310100&cepDestino=20040020
   *   &peso=500&comprimento=20&largura=15&altura=10
   *   &vlDeclarado=200
   */
  @Get('preco/:codigoServico')
  calcularFrete(
    @Param('codigoServico') codigoServico: string,
    @Query('cepOrigem') cepOrigem: string,
    @Query('cepDestino') cepDestino: string,
    @Query('peso') peso: string,
    @Query('comprimento') comprimento: string,
    @Query('largura') largura: string,
    @Query('altura') altura: string,
    @Query('vlDeclarado') vlDeclarado?: string,
  ) {
    return this.correiosService.calcularFrete({
      codigoServico,
      cepOrigem,
      cepDestino,
      pesoGramas: Number(peso),
      comprimento: Number(comprimento),
      largura: Number(largura),
      altura: Number(altura),
      vlDeclarado: vlDeclarado ? Number(vlDeclarado) : undefined,
    });
  }

  /** GET /correios/rastrear/AA123456789BR */
  @Get('rastrear/:codigo')
  rastrearObjeto(@Param('codigo') codigo: string) {
    return this.correiosService.rastrearObjeto(codigo);
  }

  /** POST /correios/rastrear/lote — body: { codigos: ['AA1BR', 'AA2BR'] } */
  @Post('rastrear/lote')
  rastrearVarios(@Body('codigos') codigos: string[]) {
    return this.correiosService.rastrearVarios(codigos);
  }

  /** POST /correios/prepostagem — cria pré-postagem e retorna id + código de rastreio */
  @Post('prepostagem')
  criarPrePostagem(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.correiosService.criarPrePostagem(body, user?.id);
  }

  /** POST /correios/rotulo — body: { idsPrePostagem: ['PRxxx'], tipoRotulo: 'P' } — retorna PDF */
  @Post('rotulo')
  async gerarRotulo(
    @Body('idsPrePostagem') idsPrePostagem: string[],
    @Body('tipoRotulo') tipoRotulo: 'P' | 'R' = 'P',
    @Res() res: Response,
  ) {
    const pdf = await this.correiosService.gerarRotulo(idsPrePostagem, tipoRotulo);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="etiqueta-correios.pdf"',
      'Content-Length': pdf.length,
    });
    res.send(pdf);
  }

  /** DELETE /correios/prepostagem/:id — cancela pré-postagem pelo ID Correios */
  @Delete('prepostagem/:id')
  cancelarPrePostagem(@Param('id') id: string) {
    return this.correiosService.cancelarPrePostagem(id);
  }

  /** GET /correios/comprovante/:codigo — comprovante de entrega em PDF */
  @Get('comprovante/:codigo')
  async baixarComprovante(@Param('codigo') codigo: string, @Res() res: Response) {
    const pdf = await this.correiosService.baixarComprovanteEntrega(codigo);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="comprovante-${codigo.replace(/\s/g, '').toUpperCase()}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.send(pdf);
  }
}
