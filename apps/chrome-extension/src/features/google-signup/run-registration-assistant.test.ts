// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clickNextButton: vi.fn(),
  detectStep: vi.fn(),
  fillKnownFields: vi.fn(),
  readVisibleError: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: { runtime: { sendMessage: mocks.sendMessage } },
}));

vi.mock('./detector', () => ({ detectStep: mocks.detectStep }));
vi.mock('./error-parser', () => ({
  isUsernameUnavailable: vi.fn(() => false),
  readVisibleError: mocks.readVisibleError,
}));
vi.mock('./form-filler', () => ({
  clickNextButton: mocks.clickNextButton,
  fillKnownFields: mocks.fillKnownFields,
  replaceUsername: vi.fn(),
}));

import {
  MAX_FILL_ATTEMPTS,
  resetFillAttempts,
  runRegistrationAssistant,
} from './run-registration-assistant';

const task = {
  id: 'task-1',
  workerId: 'worker-1',
  status: 'RUNNING',
  currentStep: 'BIRTHDAY_GENDER',
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

describe('registration assistant recovery', () => {
  beforeEach(() => {
    resetFillAttempts();
    vi.clearAllMocks();
    history.replaceState({}, '', '/lifecycle/steps/signup/birthdaygender');
    mocks.detectStep.mockReturnValue({ step: 'BIRTHDAY_GENDER', requiresUser: false });
    mocks.readVisibleError.mockReturnValue(null);
    mocks.clickNextButton.mockResolvedValue(true);
    mocks.sendMessage.mockImplementation(async (message) =>
      message.type === 'GET_ACTIVE_TASK' ? task : undefined,
    );
  });

  it('rechecks the form and clicks Next after the previous fill retry budget was exhausted', async () => {
    mocks.fillKnownFields.mockResolvedValue({ filled: ['day', 'year'], missing: ['month'] });

    for (let attempt = 0; attempt < MAX_FILL_ATTEMPTS; attempt++) {
      await runRegistrationAssistant();
    }

    // Google can commit a custom dropdown after the last observer pass. The next pass must
    // inspect that current state instead of returning forever from the stale failure counter.
    mocks.fillKnownFields.mockResolvedValue({
      filled: ['day', 'year', 'month', 'gender'],
      missing: [],
    });
    await runRegistrationAssistant();

    expect(mocks.fillKnownFields).toHaveBeenCalledTimes(MAX_FILL_ATTEMPTS + 1);
    expect(mocks.fillKnownFields).toHaveBeenLastCalledWith(
      task,
      undefined,
      'BIRTHDAY_GENDER',
      false,
    );
    expect(mocks.clickNextButton).toHaveBeenCalledOnce();
  });

  it('keeps an incomplete form automatic and starts a fresh bounded retry cycle', async () => {
    mocks.fillKnownFields.mockResolvedValue({ filled: ['day', 'year'], missing: ['month'] });

    const results = [];
    for (let attempt = 0; attempt < MAX_FILL_ATTEMPTS + 2; attempt++) {
      results.push(await runRegistrationAssistant());
    }

    expect(results[MAX_FILL_ATTEMPTS - 1]).toMatchObject({ requiresUser: false });
    expect(results[MAX_FILL_ATTEMPTS]).toMatchObject({ requiresUser: false });
    expect(mocks.fillKnownFields).toHaveBeenNthCalledWith(
      MAX_FILL_ATTEMPTS + 1,
      task,
      undefined,
      'BIRTHDAY_GENDER',
      false,
    );
    expect(mocks.fillKnownFields).toHaveBeenNthCalledWith(
      MAX_FILL_ATTEMPTS + 2,
      task,
      undefined,
      'BIRTHDAY_GENDER',
      true,
    );
    expect(mocks.clickNextButton).not.toHaveBeenCalled();
  });
});
