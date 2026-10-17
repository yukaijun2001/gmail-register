import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { DomainError } from '../../common/domain-error';
import { PrismaService } from '../../infrastructure/prisma.service';

export interface WorkerRequest extends Request {
  worker: { id: string; isEnabled: boolean };
}

@Injectable()
export class WorkerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WorkerRequest>();
    const authorization = request.header('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token)
      throw new DomainError(
        'WORKER_UNAUTHORIZED',
        'Worker token is required',
        HttpStatus.UNAUTHORIZED,
      );
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const worker = await this.prisma.worker.findUnique({ where: { tokenHash } });
    if (!worker)
      throw new DomainError(
        'WORKER_UNAUTHORIZED',
        'Worker token is invalid',
        HttpStatus.UNAUTHORIZED,
      );
    if (!worker.isEnabled)
      throw new DomainError('WORKER_DISABLED', 'Worker is disabled', HttpStatus.FORBIDDEN);
    request.worker = { id: worker.id, isEnabled: worker.isEnabled };
    return true;
  }
}
