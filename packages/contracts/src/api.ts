import { z } from 'zod';

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'WORKER_UNAUTHORIZED',
  'WORKER_DISABLED',
  'WORKER_OFFLINE',
  'TASK_NOT_FOUND',
  'TASK_ALREADY_CLAIMED',
  'TASK_LEASE_EXPIRED',
  'TASK_STATE_CONFLICT',
  'FORM_ELEMENT_NOT_FOUND',
  'FORM_VALIDATION_FAILED',
  'USERNAME_UNAVAILABLE',
  'PHONE_VERIFICATION_REQUIRED',
  'PHONE_NUMBER_REJECTED',
  'ADDITIONAL_VERIFICATION_REQUIRED',
  'PAGE_STRUCTURE_CHANGED',
  'NETWORK_TIMEOUT',
  'SESSION_EXPIRED',
  'REGISTRATION_RESULT_UNCERTAIN',
  'INTERNAL_SERVER_ERROR',
] as const;

export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export interface ApiSuccess<T> {
  success: true;
  data: T;
  request_id: string;
}

export interface ApiFailure {
  success: false;
  error: { code: ErrorCode; message: string };
  request_id: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
