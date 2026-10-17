import { HttpStatus, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import {
  ACTIVE_TASK_STATUSES,
  CreateTaskSchema,
  RegenerateUsernameSchema,
  ReportResultSchema,
  TaskProgressSchema,
  canTransitionTask,
  type RegenerateUsernameResult,
  type TaskStatus,
} from '@gmail-manager/contracts';
import { Prisma, type RegistrationStep } from '@prisma/client';
import { DomainError } from '../../common/domain-error';
import { parseInput } from '../../common/zod';
import { PrismaService } from '../../infrastructure/prisma.service';
import { generateRandomUsername } from '../accounts/random-account';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const MAX_USERNAME_RETRIES = 5;

@Injectable()
export class TasksService implements OnModuleInit, OnModuleDestroy {
  private sweeper?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  /** The pipeline runs unattended, so stalled states are closed by a background sweep. */
  onModuleInit(): void {
    const intervalMs = Number(process.env.AUTOMATION_SWEEP_SECONDS || 60) * 1000;
    this.sweeper = setInterval(() => {
      void this.resolveStalledTasks().catch(() => undefined);
    }, intervalMs);
    this.sweeper.unref();
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  create(raw: unknown) {
    const input = parseInput(CreateTaskSchema, raw);
    return this.prisma.task.create({
      data: { accountId: input.accountId, priority: input.priority },
      include: { account: { select: { desiredUsername: true, firstName: true, lastName: true } } },
    });
  }

  list() {
    return this.prisma.task.findMany({
      include: {
        account: { select: { desiredUsername: true, firstName: true, lastName: true } },
        worker: { select: { id: true, deviceName: true } },
        _count: { select: { events: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  get(id: string) {
    return this.prisma.task.findUniqueOrThrow({
      where: { id },
      include: {
        account: {
          select: {
            desiredUsername: true,
            firstName: true,
            lastName: true,
            birthday: true,
            gender: true,
            phoneReference: true,
            recoveryEmail: true,
          },
        },
        worker: { select: { id: true, deviceName: true } },
        events: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
  }

  async getAssigned(id: string, workerId: string) {
    const task = await this.get(id);
    if (task.workerId !== workerId) {
      throw new DomainError(
        'TASK_NOT_FOUND',
        'Task is not assigned to this worker',
        HttpStatus.NOT_FOUND,
      );
    }
    return task;
  }

  async claim(workerId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const worker = await tx.worker.findUniqueOrThrow({ where: { id: workerId } });
        if (worker.currentTaskId) {
          const current = await tx.task.findUnique({ where: { id: worker.currentTaskId } });
          if (current && ACTIVE_TASK_STATUSES.includes(current.status as TaskStatus)) {
            throw new DomainError(
              'TASK_ALREADY_CLAIMED',
              'Worker already has an active task',
              HttpStatus.CONFLICT,
            );
          }
        }

        const candidates = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM tasks
        WHERE status = 'PENDING'
        ORDER BY priority DESC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);
        const selected = candidates[0];
        if (!selected) return null;

        const leaseToken = randomBytes(32).toString('base64url');
        const duration = Number(process.env.LEASE_DURATION_SECONDS || 180);
        const leaseExpiresAt = new Date(Date.now() + duration * 1000);
        const task = await tx.task.update({
          where: { id: selected.id },
          data: {
            status: 'CLAIMED',
            workerId,
            leaseTokenHash: hash(leaseToken),
            leaseVersion: { increment: 1 },
            leaseExpiresAt,
            startedAt: new Date(),
            events: {
              create: {
                workerId,
                eventType: 'TASK_CLAIMED',
                step: 'OPEN_SIGNUP',
                message: 'Task claimed by worker',
              },
            },
          },
          include: {
            account: {
              select: {
                desiredUsername: true,
                firstName: true,
                lastName: true,
                birthday: true,
                gender: true,
                phoneReference: true,
                recoveryEmail: true,
              },
            },
          },
        });
        await tx.worker.update({
          where: { id: workerId },
          data: { currentTaskId: task.id, status: 'BUSY', lastHeartbeatAt: new Date() },
        });
        return { ...task, leaseToken, leaseTokenHash: undefined };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async renew(taskId: string, workerId: string, raw: unknown) {
    const lease = parseInput(
      TaskProgressSchema.pick({ leaseToken: true, leaseVersion: true }),
      raw,
    );
    // Renewal is the recovery path after a browser/service-worker suspension. Ownership is
    // still protected by worker id, token hash and lease version; only the wall-clock expiry is
    // ignored here. A reassigned task has a different version/token and remains rejected.
    const task = await this.requireLease(
      taskId,
      workerId,
      lease.leaseToken,
      lease.leaseVersion,
      true,
    );
    const duration = Number(process.env.LEASE_DURATION_SECONDS || 180);
    return this.prisma.task.update({
      where: { id: task.id },
      data: { leaseExpiresAt: new Date(Date.now() + duration * 1000) },
      select: { id: true, leaseVersion: true, leaseExpiresAt: true },
    });
  }

  async progress(taskId: string, workerId: string, raw: unknown) {
    const input = parseInput(TaskProgressSchema, raw);
    const duplicate = await this.prisma.taskEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (duplicate) return this.get(taskId);
    const task = await this.requireLease(taskId, workerId, input.leaseToken, input.leaseVersion);
    if (
      task.status !== input.status &&
      !canTransitionTask(task.status as TaskStatus, input.status)
    ) {
      throw new DomainError(
        'TASK_STATE_CONFLICT',
        `Cannot transition ${task.status} to ${input.status}`,
        HttpStatus.CONFLICT,
      );
    }
    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: input.status,
        currentStep: input.step as RegistrationStep,
        events: {
          create: {
            workerId,
            idempotencyKey: input.idempotencyKey,
            eventType: 'TASK_PROGRESS',
            step: input.step as RegistrationStep,
            message: input.message,
          },
        },
      },
      include: { events: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
  }

  async credentials(taskId: string, workerId: string, token: string, version: number) {
    const task = await this.requireLease(taskId, workerId, token, version);
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: task.accountId },
      select: { password: true },
    });
    return { password: account.password, expiresInSeconds: 30 };
  }

  async regenerateUsername(
    taskId: string,
    workerId: string,
    raw: unknown,
  ): Promise<RegenerateUsernameResult> {
    const input = parseInput(RegenerateUsernameSchema, raw);
    const task = await this.requireLease(taskId, workerId, input.leaseToken, input.leaseVersion);
    if (task.currentStep !== 'USERNAME') {
      throw new DomainError(
        'TASK_STATE_CONFLICT',
        'Username can only be regenerated during the username step',
        HttpStatus.CONFLICT,
      );
    }

    const duplicate = await this.prisma.taskEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: task.accountId },
      select: { firstName: true, lastName: true, desiredUsername: true },
    });
    const retryCount = await this.countUsernameRetries(taskId);

    if (duplicate) {
      const currentTask = await this.prisma.task.findUniqueOrThrow({ where: { id: taskId } });
      return {
        desiredUsername: account.desiredUsername,
        retryCount,
        requiresUser: duplicate.eventType === 'USERNAME_RETRY_LIMIT_REACHED',
        status: currentTask.status as TaskStatus,
      };
    }

    if (account.desiredUsername !== input.rejectedUsername) {
      throw new DomainError(
        'TASK_STATE_CONFLICT',
        'The rejected username is no longer current',
        HttpStatus.CONFLICT,
      );
    }

    if (retryCount >= MAX_USERNAME_RETRIES) {
      await this.prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'WAITING_USER',
          events: {
            create: {
              workerId,
              idempotencyKey: input.idempotencyKey,
              eventType: 'USERNAME_RETRY_LIMIT_REACHED',
              step: 'USERNAME',
              message: `Username rejected ${retryCount} times; waiting for the user to resume registration`,
              metadata: { rejectedUsername: input.rejectedUsername, retryCount },
            },
          },
        },
      });
      return {
        desiredUsername: account.desiredUsername,
        retryCount,
        requiresUser: true,
        status: 'WAITING_USER',
      };
    }

    let desiredUsername = '';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = generateRandomUsername(account.firstName, account.lastName);
      const exists = await this.prisma.account.findUnique({
        where: { desiredUsername: candidate },
        select: { id: true },
      });
      if (!exists) {
        desiredUsername = candidate;
        break;
      }
    }
    if (!desiredUsername) {
      throw new DomainError(
        'USERNAME_UNAVAILABLE',
        'Unable to generate an unused username',
        HttpStatus.CONFLICT,
      );
    }

    const nextRetryCount = retryCount + 1;
    const status: TaskStatus = task.status === 'WAITING_USER' ? 'RUNNING' : task.status;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.account.updateMany({
        where: { id: task.accountId, desiredUsername: input.rejectedUsername },
        data: { desiredUsername },
      });
      if (updated.count !== 1) {
        throw new DomainError(
          'TASK_STATE_CONFLICT',
          'Username changed while processing the request',
          HttpStatus.CONFLICT,
        );
      }
      await tx.task.update({
        where: { id: taskId },
        data: {
          status,
          events: {
            create: {
              workerId,
              idempotencyKey: input.idempotencyKey,
              eventType: 'USERNAME_REGENERATED',
              step: 'USERNAME',
              message: `Username regenerated after Google rejected ${input.rejectedUsername}`,
              metadata: {
                rejectedUsername: input.rejectedUsername,
                desiredUsername,
                retryCount: nextRetryCount,
              },
            },
          },
        },
      });
    });

    return { desiredUsername, retryCount: nextRetryCount, requiresUser: false, status };
  }

  /**
   * Automatic retry budget of the current username attempt. Counting restarts after every pause,
   * so resuming a paused task always hands the pipeline a fresh budget instead of a dead end.
   */
  private async countUsernameRetries(taskId: string): Promise<number> {
    const lastPause = await this.prisma.taskEvent.findFirst({
      where: { taskId, eventType: 'USERNAME_RETRY_LIMIT_REACHED' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return this.prisma.taskEvent.count({
      where: {
        taskId,
        eventType: 'USERNAME_REGENERATED',
        ...(lastPause ? { createdAt: { gt: lastPause.createdAt } } : {}),
      },
    });
  }

  async reportResult(taskId: string, workerId: string, raw: unknown) {
    const input = parseInput(ReportResultSchema, raw);
    const duplicate = await this.prisma.taskEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (duplicate) return this.get(taskId);
    const task = await this.requireLease(taskId, workerId, input.leaseToken, input.leaseVersion);
    const status = input.result === 'UNCERTAIN' ? 'AUTO_VERIFICATION' : input.result;
    if (!canTransitionTask(task.status as TaskStatus, status)) {
      throw new DomainError(
        'TASK_STATE_CONFLICT',
        `Cannot transition ${task.status} to ${status}`,
        HttpStatus.CONFLICT,
      );
    }
    const verifying = status === 'AUTO_VERIFICATION';
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          status,
          completedAt: verifying ? null : new Date(),
          failureCode: verifying
            ? 'REGISTRATION_RESULT_UNCERTAIN'
            : status === 'FAILED'
              ? 'REGISTRATION_FAILED'
              : null,
          failureMessage: input.message,
          leaseExpiresAt: verifying ? task.leaseExpiresAt : null,
          leaseTokenHash: verifying ? task.leaseTokenHash : null,
          events: {
            create: {
              workerId,
              idempotencyKey: input.idempotencyKey,
              eventType: 'RESULT_REPORTED',
              step: 'RESULT_CONFIRMATION',
              message: input.message,
              metadata: { result: input.result },
            },
          },
        },
      });
      if (!verifying)
        await tx.worker.update({
          where: { id: workerId },
          data: { currentTaskId: null, status: 'IDLE' },
        });
      return updated;
    });
  }

  async adminTransition(id: string, status: TaskStatus) {
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id } });
    if (!canTransitionTask(task.status as TaskStatus, status)) {
      throw new DomainError(
        'TASK_STATE_CONFLICT',
        `Cannot transition ${task.status} to ${status}`,
        HttpStatus.CONFLICT,
      );
    }
    const terminal = ['SUCCESS', 'FAILED', 'CANCELLED'].includes(status);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: {
          status,
          completedAt: terminal ? new Date() : undefined,
          leaseTokenHash: terminal ? null : undefined,
          leaseExpiresAt: terminal ? null : undefined,
          events: {
            create: {
              eventType: `CONTROL_${status}`,
              message: `Task changed to ${status} through the control API`,
            },
          },
        },
      });
      if (terminal && task.workerId)
        await tx.worker.update({
          where: { id: task.workerId },
          data: { currentTaskId: null, status: 'IDLE' },
        });
      return updated;
    });
  }

  async stats() {
    const [groups, onlineWorkers, totalAccounts] = await Promise.all([
      this.prisma.task.groupBy({ by: ['status'], _count: true }),
      this.prisma.worker.count({
        where: {
          isEnabled: true,
          lastHeartbeatAt: {
            gte: new Date(Date.now() - Number(process.env.HEARTBEAT_TIMEOUT_SECONDS || 180) * 1000),
          },
        },
      }),
      this.prisma.account.count(),
    ]);
    const counts = Object.fromEntries(groups.map((group) => [group.status, group._count]));
    return {
      counts,
      onlineWorkers,
      totalAccounts,
      totalTasks: groups.reduce((sum, group) => sum + group._count, 0),
    };
  }

  /**
   * Registration never waits for a person to confirm the outcome, so an uncertain result is
   * closed automatically once the worker stops producing evidence. `WAITING_USER` is deliberately
   * left alone: it means a human still has to clear a security check such as a CAPTCHA.
   */
  async resolveStalledTasks(): Promise<number> {
    const candidates = await this.prisma.task.findMany({
      where: { status: 'AUTO_VERIFICATION' },
      select: { id: true, workerId: true },
    });
    if (!candidates.length) return 0;

    const verificationTimeout = Number(process.env.AUTO_VERIFICATION_TIMEOUT_SECONDS || 300) * 1000;
    const now = Date.now();
    let resolved = 0;

    for (const task of candidates) {
      const lastEvent = await this.prisma.taskEvent.findFirst({
        where: { taskId: task.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const stalledSince = lastEvent?.createdAt.getTime() ?? now;
      if (now - stalledSince < verificationTimeout) continue;

      await this.prisma.$transaction(async (tx) => {
        await tx.task.update({
          where: { id: task.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            failureCode: 'REGISTRATION_RESULT_UNCERTAIN',
            failureMessage:
              'Automatic verification timed out without a definite registration result',
            leaseTokenHash: null,
            leaseExpiresAt: null,
            events: {
              create: {
                eventType: 'AUTO_RESOLVED',
                step: 'RESULT_CONFIRMATION',
                message: 'Task failed automatically: the registration result stayed uncertain',
              },
            },
          },
        });
        if (task.workerId)
          await tx.worker.updateMany({
            where: { id: task.workerId, currentTaskId: task.id },
            data: { currentTaskId: null, status: 'IDLE' },
          });
      });
      resolved += 1;
    }
    return resolved;
  }

  private async requireLease(
    taskId: string,
    workerId: string,
    leaseToken: string,
    leaseVersion: number,
    allowExpired = false,
  ) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.workerId !== workerId)
      throw new DomainError(
        'TASK_NOT_FOUND',
        'Task is not assigned to this worker',
        HttpStatus.NOT_FOUND,
      );
    if (
      !task.leaseTokenHash ||
      task.leaseTokenHash !== hash(leaseToken) ||
      task.leaseVersion !== leaseVersion
    ) {
      throw new DomainError(
        'TASK_LEASE_EXPIRED',
        'Task lease is invalid or obsolete',
        HttpStatus.CONFLICT,
      );
    }
    if (!allowExpired && (!task.leaseExpiresAt || task.leaseExpiresAt <= new Date())) {
      throw new DomainError('TASK_LEASE_EXPIRED', 'Task lease has expired', HttpStatus.CONFLICT);
    }
    return task;
  }
}
