import { browser } from 'wxt/browser';
import type { ActiveTask } from '../../shared/types';
import { detectStep, type Detection } from './detector';
import { isUsernameUnavailable, readVisibleError } from './error-parser';
import { clickNextButton, fillKnownFields, replaceUsername } from './form-filler';

/** Consecutive passes that left fields unfilled on the same page before the pipeline pauses. */
export const MAX_FILL_ATTEMPTS = 3;
let failedFill: { key: string; count: number } | undefined;

/** Clears the retry counter (used when the pipeline re-detects the page explicitly, and by tests). */
export function resetFillAttempts(): void {
  failedFill = undefined;
}

/** Ordinary form steps remain retryable until Google actually navigates away. */
export function isRegistrationResultHandled(result: unknown): boolean {
  const detection = result as Detection | null | undefined;
  return Boolean(detection && (detection.requiresUser || detection.step === 'REVIEW'));
}

export async function runRegistrationAssistant(execute = true, force = false) {
  // An explicit re-detect/execute is the go-ahead to try the page again.
  if (force) resetFillAttempts();
  const detection = detectStep();
  if (!execute) return detection;
  const task = (await browser.runtime.sendMessage({ type: 'GET_ACTIVE_TASK' })) as
    ActiveTask | undefined;
  if (!task) return detection;
  if (!detection) {
    await browser.runtime.sendMessage({
      type: 'PAGE_STATE',
      step: 'ADDITIONAL_VERIFICATION',
      requiresUser: false,
      reason: 'PAGE_LOADING: 正在等待页面结构并自动重试',
    });
    return null;
  }
  await browser.runtime.sendMessage({ type: 'PAGE_STATE', ...detection });
  // The final page carries no fields: the runtime reads the outcome from the step itself.
  if (detection.step === 'REVIEW') return detection;
  if (detection.requiresUser) return detection;

  const visibleError = readVisibleError();
  if (detection.step === 'USERNAME' && visibleError && isUsernameUnavailable(visibleError)) {
    const replacement = (await browser.runtime.sendMessage({
      type: 'REGENERATE_USERNAME',
      rejectedUsername: task.account.desiredUsername,
    })) as { desiredUsername: string; retryCount: number; requiresUser: boolean };
    if (replacement.requiresUser) {
      return {
        step: 'USERNAME' as const,
        requiresUser: true,
        reason: `用户名连续冲突 ${replacement.retryCount} 次，请人工处理`,
      };
    }
    if (!replaceUsername(replacement.desiredUsername)) {
      await browser.runtime.sendMessage({
        type: 'PAGE_STATE',
        step: 'USERNAME',
        requiresUser: true,
        reason: 'FORM_ELEMENT_NOT_FOUND: 无法替换用户名输入框',
      });
    }
    return {
      step: 'USERNAME' as const,
      requiresUser: false,
      reason: `用户名已自动更换（第 ${replacement.retryCount} 次）`,
    };
  }

  const attemptKey = `${location.href}:${detection.step}`;
  const retryBudgetSpent =
    failedFill?.key === attemptKey && failedFill.count >= MAX_FILL_ATTEMPTS;

  let password: string | undefined;
  if (detection.step === 'PASSWORD') {
    const response = (await browser.runtime.sendMessage({ type: 'GET_PASSWORD' })) as {
      password: string;
    };
    password = response.password;
  }
  // Once the retry budget is spent, keep inspecting the current DOM without touching it.
  // Google may commit a Material dropdown just after the last observer pass; accepting that
  // committed value lets the pipeline recover and click Next without reopening the menu.
  const fillResult = await fillKnownFields(task, password, detection.step, !retryBudgetSpent);
  password = undefined;
  if (fillResult.missing.length) {
    if (retryBudgetSpent) {
      // This read-only pass prevents a custom dropdown from being toggled repeatedly. If it is
      // still incomplete, start a fresh bounded cycle on the next scheduler tick.
      resetFillAttempts();
      const result = {
        ...detection,
        requiresUser: false,
        reason: `FORM_ELEMENT_NOT_READY: 正在重新尝试 ${fillResult.missing.join(', ')}`,
      };
      await browser.runtime.sendMessage({ type: 'PAGE_STATE', ...result });
      return result;
    }
    // Bounded retries: an unfillable control must not be reopened forever.
    failedFill = {
      key: attemptKey,
      count: failedFill?.key === attemptKey ? failedFill.count + 1 : 1,
    };
    if (failedFill.count >= MAX_FILL_ATTEMPTS) {
      const result = {
        ...detection,
        requiresUser: false,
        reason: `FORM_ELEMENT_NOT_READY: 正在核对 ${fillResult.missing.join(', ')} 并自动重试`,
      };
      await browser.runtime.sendMessage({ type: 'PAGE_STATE', ...result });
      return result;
    }
    const result = {
      ...detection,
      requiresUser: false,
      reason: `FORM_ELEMENT_NOT_READY: 正在等待 ${fillResult.missing.join(', ')}`,
    };
    await browser.runtime.sendMessage({ type: 'PAGE_STATE', ...result });
    return null;
  }
  failedFill = undefined;
  const remainingError = readVisibleError();
  if (remainingError) {
    await browser.runtime.sendMessage({
      type: 'PAGE_STATE',
      step: detection.step,
      requiresUser: true,
      reason: `FORM_VALIDATION_FAILED: ${remainingError}`,
    });
    return {
      ...detection,
      requiresUser: true,
      reason: `FORM_VALIDATION_FAILED: ${remainingError}`,
    };
  }
  if (!(await clickNextButton())) {
    const result = {
      ...detection,
      requiresUser: false,
      reason: 'NEXT_BUTTON_NOT_READY: 正在等待 Google Next 按钮',
    };
    await browser.runtime.sendMessage({ type: 'PAGE_STATE', ...result });
    // Google may insert or enable the Material button after the fields commit. Returning null
    // keeps this page retryable instead of letting the page assistant mark the key handled.
    return null;
  }
  return detection;
}
