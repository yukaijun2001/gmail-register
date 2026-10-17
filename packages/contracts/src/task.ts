import { z } from 'zod';

export const TASK_STATUSES = [
  'PENDING',
  'CLAIMED',
  'RUNNING',
  'WAITING_USER',
  'PAUSED',
  'AUTO_VERIFICATION',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
] as const;

export const TaskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const REGISTRATION_STEPS = [
  'OPEN_SIGNUP',
  'PERSONAL_INFO',
  'BIRTHDAY_GENDER',
  'USERNAME',
  'PASSWORD',
  'PHONE_VERIFICATION',
  'ADDITIONAL_VERIFICATION',
  'REVIEW',
  'RESULT_CONFIRMATION',
] as const;

export const RegistrationStepSchema = z.enum(REGISTRATION_STEPS);
export type RegistrationStep = z.infer<typeof RegistrationStepSchema>;

export const ACTIVE_TASK_STATUSES: readonly TaskStatus[] = [
  'CLAIMED',
  'RUNNING',
  'WAITING_USER',
  'PAUSED',
  'AUTO_VERIFICATION',
];

export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ['SUCCESS', 'FAILED', 'CANCELLED'];

export const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  PENDING: ['CLAIMED', 'CANCELLED'],
  CLAIMED: ['RUNNING', 'WAITING_USER', 'PAUSED', 'CANCELLED'],
  RUNNING: ['WAITING_USER', 'PAUSED', 'AUTO_VERIFICATION', 'SUCCESS', 'FAILED', 'CANCELLED'],
  // 人工在页面上完成安全验证后，自动流程可能直接从终态页面恢复，因此允许直接收尾。
  WAITING_USER: ['RUNNING', 'PAUSED', 'AUTO_VERIFICATION', 'SUCCESS', 'FAILED', 'CANCELLED'],
  PAUSED: ['RUNNING', 'AUTO_VERIFICATION', 'CANCELLED'],
  AUTO_VERIFICATION: ['SUCCESS', 'FAILED', 'CANCELLED'],
  SUCCESS: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

export const CreateTaskSchema = z.object({
  accountId: z.string().uuid(),
  priority: z.number().int().min(-100).max(100).default(0),
});

export const LeaseSchema = z.object({
  leaseToken: z.string().min(24),
  leaseVersion: z.number().int().positive(),
});

export const TaskProgressSchema = LeaseSchema.extend({
  status: TaskStatusSchema,
  step: RegistrationStepSchema,
  message: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().uuid(),
});

export const ReportResultSchema = LeaseSchema.extend({
  result: z.enum(['SUCCESS', 'FAILED', 'UNCERTAIN']),
  message: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().uuid(),
});

export const RegenerateUsernameSchema = LeaseSchema.extend({
  rejectedUsername: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9.]{6,30}$/),
  idempotencyKey: z.string().uuid(),
});

export interface RegenerateUsernameResult {
  desiredUsername: string;
  retryCount: number;
  /**
   * True when the page needs a person to finish it (例如 CAPTCHA 安全验证)，
   * so the task parks in `WAITING_USER` until the extension is triggered again.
   */
  requiresUser: boolean;
  status: TaskStatus;
}

export type CreateTask = z.infer<typeof CreateTaskSchema>;
export type TaskProgress = z.infer<typeof TaskProgressSchema>;
export type ReportResult = z.infer<typeof ReportResultSchema>;
export type RegenerateUsername = z.infer<typeof RegenerateUsernameSchema>;
