import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { CadastrosModule } from './cadastros/cadastros.module';
import { OrderModule } from './orders/order.module';
import { ProductModule } from './product/product.module';
import { StockModule } from './stock/stock.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    ProductModule,
    StockModule,
    OrderModule,
    CadastrosModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}