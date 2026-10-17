import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : null;
    const structured =
      typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
    const code = typeof structured.code === 'string' ? structured.code : 'INTERNAL_SERVER_ERROR';
    const message =
      typeof structured.message === 'string'
        ? structured.message
        : exception instanceof Error && status < 500
          ? exception.message
          : 'Internal server error';
    response.status(status).json({
      success: false,
      error: { code, message },
      request_id: response.locals.requestId,
    });
  }
}
