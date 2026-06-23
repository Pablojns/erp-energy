import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AppLogger } from './app-logger';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new AppLogger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      this.logger.error('Unhandled non-http exception', exception);
      return;
    }

    const http = host.switchToHttp();
    const response = http.getResponse<{
      status: (statusCode: number) => { json: (payload: unknown) => void };
    }>();
    const request = http.getRequest<{ method?: string; originalUrl?: string }>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const responseBody =
      exception instanceof HttpException
        ? exception.getResponse()
        : {
            statusCode,
            message: 'Internal server error',
          };

    if (statusCode >= 500) {
      this.logger.error('Unhandled HTTP exception', exception, {
        statusCode,
        method: request.method,
        path: request.originalUrl,
      });
    } else {
      this.logger.warn('Handled HTTP exception', {
        statusCode,
        method: request.method,
        path: request.originalUrl,
      });
    }

    response.status(statusCode).json(responseBody);
  }
}
