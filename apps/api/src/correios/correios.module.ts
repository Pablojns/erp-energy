import { Module } from '@nestjs/common';
import { CorreiosController } from './correios.controller';
import { CorreiosService } from './correios.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [CorreiosController],
  providers: [CorreiosService],
  exports: [CorreiosService], // disponível para OrderModule, etc.
})
export class CorreiosModule {}
