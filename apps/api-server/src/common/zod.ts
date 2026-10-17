import { HttpStatus } from '@nestjs/common';
import type { ZodType } from 'zod';
import { DomainError } from './domain-error';

export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new DomainError('VALIDATION_ERROR', message, HttpStatus.UNPROCESSABLE_ENTITY);
  }
  return parsed.data;
}
