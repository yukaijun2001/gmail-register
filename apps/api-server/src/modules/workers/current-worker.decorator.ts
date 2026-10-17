import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { WorkerRequest } from './worker-auth.guard';

export const CurrentWorker = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  return context.switchToHttp().getRequest<WorkerRequest>().worker;
});
