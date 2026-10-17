import { describe, expect, it, vi } from 'vitest';
import { AccountsService } from './accounts.service';

describe('account deletion', () => {
  it('removes dependent tasks and releases their workers in one transaction', async () => {
    const calls: string[] = [];
    const tx = {
      task: {
        findMany: vi.fn(async () => {
          calls.push('find tasks');
          return [{ id: 'task-1' }, { id: 'task-2' }];
        }),
        deleteMany: vi.fn(async () => {
          calls.push('delete tasks');
          return { count: 2 };
        }),
      },
      worker: {
        updateMany: vi.fn(async () => {
          calls.push('release workers');
          return { count: 1 };
        }),
      },
      account: {
        delete: vi.fn(async () => {
          calls.push('delete account');
          return { id: 'account-1' };
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    const service = new AccountsService(prisma as never);

    await expect(service.remove('account-1')).resolves.toEqual({ id: 'account-1' });
    expect(tx.task.findMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1' },
      select: { id: true },
    });
    expect(tx.worker.updateMany).toHaveBeenCalledWith({
      where: { currentTaskId: { in: ['task-1', 'task-2'] } },
      data: { currentTaskId: null, status: 'IDLE' },
    });
    expect(tx.task.deleteMany).toHaveBeenCalledWith({ where: { accountId: 'account-1' } });
    expect(calls).toEqual(['find tasks', 'release workers', 'delete tasks', 'delete account']);
  });
});
