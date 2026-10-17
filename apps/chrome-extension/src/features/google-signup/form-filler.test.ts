// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fillKnownFields } from './form-filler';

const task = {
  id: 'task-1',
  workerId: 'worker-1',
  status: 'RUNNING' as const,
  currentStep: 'BIRTHDAY_GENDER' as const,
  leaseToken: 'lease-token',
  leaseVersion: 1,
  leaseExpiresAt: '2026-10-16T08:00:00.000Z',
  lastSyncTime: '2026-10-16T07:00:00.000Z',
  account: {
    firstName: 'Jamie',
    lastName: 'Reed',
    birthday: '2001-06-11',
    gender: 'MALE',
    desiredUsername: 'jamie',
    phoneReference: '+10000000000',
  },
};

describe('Google birthday form state', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
      { width: 100, height: 40 },
    ] as unknown as DOMRectList);
  });

  it('accepts the values exposed by the live Google birthday page', async () => {
    document.body.innerHTML = `
      <div role="combobox" aria-labelledby="c47 c48" aria-expanded="false">
        <span id="c47">Month</span><span id="c48">June</span>
      </div>
      <input type="tel" aria-label="Day" value="11">
      <input type="tel" aria-label="Year" value="2001">
      <div role="combobox" aria-labelledby="c53 c54" aria-expanded="false">
        <span id="c53">Gender</span><span id="c54">Male</span>
      </div>
      <div role="combobox" aria-labelledby="c59 c60" aria-expanded="false">
        <span id="c59">Please refer to me as</span><span id="c60"></span>
      </div>`;

    const result = await fillKnownFields(task, undefined, 'BIRTHDAY_GENDER');

    expect(result.missing).toEqual([]);
    expect(result.filled).toEqual(expect.arrayContaining(['day', 'year', 'month', 'gender']));
  });
});
