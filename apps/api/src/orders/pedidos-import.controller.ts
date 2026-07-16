import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportApiKeyGuard } from './import-api-key.guard';
import { OrderImportService } from './order-import.service';

/**
 * Rotas de importação WEG para processos automatizados (robô / cron externo).
 * Autenticação via header `X-Import-Api-Key` — sem JWT de usuário.
 */
@Controller('api/pedidos')
export class PedidosImportController {
  constructor(private readonly orderImportService: OrderImportService) {}

  @Post('importar-arquivo')
  @UseGuards(ImportApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async importarArquivo(
    @UploadedFile() file?: { originalname?: string; buffer?: Buffer },
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Arquivo obrigatório (campo multipart: file).');
    }

    const name = (file.originalname ?? '').toLowerCase();
    if (!name.endsWith('.xlsx')) {
      throw new BadRequestException('Formato inválido. Envie um arquivo .xlsx.');
    }

    return this.orderImportService.importFromUpload(new Uint8Array(file.buffer), {
      trigger: 'AUTOMATIC',
      fileName: file.originalname ?? 'planilha.xlsx',
    });
  }
}
