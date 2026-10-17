import { z } from 'zod';
import { PhoneReferenceSchema } from './account.js';

export const VerificationTypeSchema = z.enum(['PHONE', 'CAPTCHA', 'ADDITIONAL_IDENTITY', 'OTHER']);
export const VerificationStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'EXPIRED',
  'FAILED',
]);

export const CreateVerificationSessionSchema = z.object({
  taskId: z.string().uuid(),
  phoneReference: PhoneReferenceSchema.optional(),
  provider: z.string().trim().min(1).max(80).default('automated'),
  verificationType: VerificationTypeSchema,
  expiresAt: z.string().datetime(),
});
