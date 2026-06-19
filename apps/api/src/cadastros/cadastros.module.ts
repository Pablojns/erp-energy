import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CadastrosController } from './cadastros.controller';
import { CadastrosService } from './cadastros.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CadastrosController],
  providers: [CadastrosService],
  exports: [CadastrosService],
})
export class CadastrosModule {}
