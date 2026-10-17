import { z } from 'zod';

export const WorkerStatusSchema = z.enum(['IDLE', 'BUSY', 'PAUSED', 'OFFLINE']);

export const RegisterWorkerSchema = z.object({
  profileIdentifier: z.string().trim().min(8).max(160),
  extensionVersion: z.string().trim().min(1).max(40),
});

export const WorkerHeartbeatSchema = z.object({
  status: WorkerStatusSchema,
  currentTaskId: z.string().uuid().nullable(),
});

export type RegisterWorker = z.infer<typeof RegisterWorkerSchema>;
export type WorkerHeartbeat = z.infer<typeof WorkerHeartbeatSchema>;
