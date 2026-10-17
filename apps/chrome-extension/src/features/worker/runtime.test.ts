import { describe, expect, it } from 'vitest';
import { leaseNeedsRenewal, shouldAdoptAutomationTab } from './runtime';

describe('automation tab adoption', () => {
  it('adopts the active Google tab when a live task is still bound to an old tab id', () => {
    expect(
      shouldAdoptAutomationTab(
        {
          activeTask: { status: 'WAITING_USER' } as never,
          automationTabId: 12,
          paused: false,
        },
        { id: 42, active: true },
        true,
      ),
    ).toBe(true);
  });

  it('adopts when the old automation tab is gone even if the sender omits active', () => {
    expect(
      shouldAdoptAutomationTab(
        {
          activeTask: { status: 'WAITING_USER' } as never,
          automationTabId: 12,
          paused: false,
        },
        { id: 42 },
        false,
      ),
    ).toBe(true);
  });

  it('does not let a background tab steal the running task', () => {
    expect(
      shouldAdoptAutomationTab(
        {
          activeTask: { status: 'RUNNING' } as never,
          automationTabId: 12,
          paused: false,
        },
        { id: 42, active: false },
        true,
      ),
    ).toBe(false);
  });

  it('does not adopt a tab while the task is paused', () => {
    expect(
      shouldAdoptAutomationTab(
        {
          activeTask: { status: 'RUNNING' } as never,
          automationTabId: 12,
          paused: true,
        },
        { id: 42, active: true },
        false,
      ),
    ).toBe(false);
  });
});

describe('task lease freshness', () => {
  it('renews expired and soon-expiring leases, but not fresh leases', () => {
    const now = Date.parse('2026-10-16T08:00:00.000Z');
    expect(leaseNeedsRenewal('2026-10-16T07:59:59.000Z', now)).toBe(true);
    expect(leaseNeedsRenewal('2026-10-16T08:00:45.000Z', now)).toBe(true);
    expect(leaseNeedsRenewal('2026-10-16T08:02:00.000Z', now)).toBe(false);
  });
});
