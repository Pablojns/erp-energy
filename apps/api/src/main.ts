import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { requestContextMiddleware } from './common/logger/request-context.middleware';
import { AppLogger } from './common/logger/app-logger';

async function bootstrap() {
  const startupLogger = new AppLogger('Bootstrap');

  const app = await NestFactory.create(AppModule);
  app.useLogger(app.get(Logger));
  app.use(requestContextMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.use(helmet());

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://erp-energy-web.vercel.app',
      'http://174.138.41.33:3000',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  await app.listen(process.env.PORT ?? 3001);
  startupLogger.info('API initialized', {
    port: Number(process.env.PORT ?? 3001),
  });
}

void bootstrap().catch((error: unknown) => {
  const logger = new AppLogger('Bootstrap');
  logger.fatal('Fatal bootstrap failure', error);
  process.exitCode = 1;
});

process.on('uncaughtException', (error) => {
  const logger = new AppLogger('Process');
  logger.fatal('Uncaught exception', error);
});

process.on('unhandledRejection', (reason) => {
  const logger = new AppLogger('Process');
  logger.fatal('Unhandled promise rejection', reason);
});
