import {
  CallHandler,
  ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { updateRequestContext } from './request-context';

type RequestWithContext = {
  method?: string;
  route?: { path?: string };
  originalUrl?: string;
  user?: { id?: string };
};

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const req = context.switchToHttp().getRequest<RequestWithContext>();
      const routePath = req.route?.path ?? req.originalUrl ?? 'unknown';
      updateRequestContext({
        action: `${req.method ?? 'UNKNOWN'} ${routePath}`,
        userId: req.user?.id ?? null,
      });
    }
    return next.handle();
  }
}
