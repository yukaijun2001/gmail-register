import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { TasksService } from './tasks.service';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

describe('task lease renewal', () => {
  it('renews an expired lease when worker, token and version still match', async () => {
    const token = 'still-owned-lease-token-1234567890';
    const update = vi.fn().mockResolvedValue({
      id: 'task-1',
      leaseVersion: 2,
      leaseExpiresAt: new Date(Date.now() + 180_000),
    });
    const prisma = {
      task: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'task-1',
          workerId: 'worker-1',
          leaseTokenHash: hash(token),
          leaseVersion: 2,
          leaseExpiresAt: new Date(Date.now() - 1_000),
        }),
        update,
      },
    };
    const service = new TasksService(prisma as never);

    await expect(
      service.renew('task-1', 'worker-1', { leaseToken: token, leaseVersion: 2 }),
    ).resolves.toMatchObject({ id: 'task-1', leaseVersion: 2 });
    expect(update).toHaveBeenCalledOnce();
  });
});
