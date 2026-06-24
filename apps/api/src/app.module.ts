import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { CadastrosModule } from './cadastros/cadastros.module';
import { ChatModule } from './chat/chat.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PermissionsModule } from './common/permissions/permissions.module';
import { OrderModule } from './orders/order.module';
import { ProductModule } from './product/product.module';
import { StockModule } from './stock/stock.module';
import { buildNestPinoParams } from './common/logger/pino-options';
import { RequestContextInterceptor } from './common/logger/request-context.interceptor';
import { AllExceptionsFilter } from './common/logger/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 60,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 1000,
      },
    ]),
    LoggerModule.forRoot(buildNestPinoParams()),
    PrismaModule,
    NotificationsModule,
    AuthModule,
    ProductModule,
    StockModule,
    OrderModule,
    CadastrosModule,
    DashboardModule,
    ChatModule,
    PermissionsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestContextInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}