import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtGuard } from '../../auth/jwt.guard';
import { RequirePermission } from '../../common/permissions/require-permission.decorator';
import { CreateEngravingTechniqueDto } from './dto/create-engraving-technique.dto';
import { UpdateEngravingTechniqueDto } from './dto/update-engraving-technique.dto';
import { EngravingService } from './engraving.service';

@Controller('api/quotes/engraving')
@UseGuards(JwtGuard)
export class EngravingController {
  constructor(private readonly engraving: EngravingService) {}

  @Get()
  @RequirePermission('crm', 'ver_modulo')
  list() {
    return this.engraving.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('crm', 'ver_modulo')
  create(@Body() dto: CreateEngravingTechniqueDto) {
    return this.engraving.create(dto);
  }

  @Patch(':id')
  @RequirePermission('crm', 'ver_modulo')
  update(@Param('id') id: string, @Body() dto: UpdateEngravingTechniqueDto) {
    return this.engraving.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('crm', 'ver_modulo')
  remove(@Param('id') id: string) {
    return this.engraving.remove(id);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('crm', 'ver_modulo')
  @UseInterceptors(FileInterceptor('file'))
  importExcel(
    @UploadedFile() file?: { originalname?: string; buffer?: Buffer },
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Arquivo obrigatório (campo multipart: file).');
    }
    const name = (file.originalname ?? '').toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      throw new BadRequestException('Formato inválido. Envie um arquivo Excel (.xlsx).');
    }
    return this.engraving.importFromExcel(new Uint8Array(file.buffer));
  }
}
