import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class ImportApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-import-api-key'];
    const expected = this.configService.get<string>('IMPORT_API_KEY')?.trim();

    if (!expected) {
      throw new UnauthorizedException(
        'IMPORT_API_KEY não configurada no servidor.',
      );
    }

    const key =
      typeof provided === 'string'
        ? provided.trim()
        : Array.isArray(provided)
          ? provided[0]?.trim()
          : '';

    if (!key || key !== expected) {
      throw new UnauthorizedException('API key de importação inválida.');
    }

    return true;
  }
}
