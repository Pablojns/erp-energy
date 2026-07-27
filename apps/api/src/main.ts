import { networkInterfaces } from 'node:os';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { requestContextMiddleware } from './common/logger/request-context.middleware';
import { AppLogger } from './common/logger/app-logger';

function getLanIpv4Addresses(): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const net of entries ?? []) {
      const family = String(net.family);
      if ((family === 'IPv4' || family === '4') && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

function printListenUrls(port: number): void {
  const lan = getLanIpv4Addresses();
  // console.log: banner legível no terminal (pino costuma sair em JSON)
  console.log('');
  console.log(`API listening on port ${port}`);
  console.log(`  Local:   http://localhost:${port}`);
  console.log(`  Local:   http://127.0.0.1:${port}`);
  if (lan.length === 0) {
    console.log('  Network: (nenhum IPv4 de rede encontrado)');
  } else {
    for (const ip of lan) {
      console.log(`  Network: http://${ip}:${port}`);
    }
  }
  console.log('');
}

async function bootstrap() {
  const startupLogger = new AppLogger('Bootstrap');

  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
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
      'http://127.0.0.1:3000',
      'http://192.168.0.11:3000',
      'https://erp-energy-web.vercel.app',
      'http://174.138.41.33:3000',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  const lan = getLanIpv4Addresses();
  printListenUrls(port);
  startupLogger.info('API initialized', {
    port,
    local: `http://localhost:${port}`,
    network: lan.map((ip) => `http://${ip}:${port}`),
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
