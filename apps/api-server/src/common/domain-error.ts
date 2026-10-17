import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@gmail-manager/contracts';

export class DomainError extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ code, message }, status);
  }
}
