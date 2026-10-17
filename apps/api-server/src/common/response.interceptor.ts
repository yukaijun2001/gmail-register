import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    return next
      .handle()
      .pipe(map((data) => ({ success: true, data, request_id: response.locals.requestId })));
  }
}
