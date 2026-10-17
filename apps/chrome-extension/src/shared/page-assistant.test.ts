// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clickNextButton } from '../features/google-signup/form-filler';
import { isRegistrationResultHandled } from '../features/google-signup/run-registration-assistant';
import { createPageAssistant } from './page-assistant';

describe('registration page scheduling', () => {
  const controllers: Array<{ stop(): void }> = [];

  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.stop());
    vi.restoreAllMocks();
  });

  it('retries the same form page after an unconfirmed Next click', async () => {
    document.body.innerHTML = `
      <div id="birthdaygenderNext">
        <button type="button" jsname="LgbsSe"><span jsname="V67aGc">Next</span></button>
      </div>`;
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
      { width: 78, height: 40 },
    ] as unknown as DOMRectList);
    let page = 'birthday-page';
    let clicks = 0;
    document.querySelector('button')!.addEventListener('click', () => {
      clicks += 1;
      // Mirrors the reported failure: Google's first programmatic click is swallowed.
      if (clicks === 2) page = 'username-page';
    });
    const result = { step: 'BIRTHDAY_GENDER', requiresUser: false } as const;
    const assist = vi.fn(async () => {
      await clickNextButton();
      return result;
    });
    const controller = createPageAssistant(
      () => page,
      assist,
      undefined,
      isRegistrationResultHandled,
    );
    controllers.push(controller);
    await controller.run();
    await controller.run();

    expect(assist).toHaveBeenCalledTimes(2);
    expect(clicks).toBe(2);
    expect(page).toBe('username-page');
  });

  it('only marks blocked and terminal registration states as handled', () => {
    expect(isRegistrationResultHandled({ step: 'BIRTHDAY_GENDER', requiresUser: false })).toBe(
      false,
    );
    expect(
      isRegistrationResultHandled({ step: 'ADDITIONAL_VERIFICATION', requiresUser: true }),
    ).toBe(true);
    expect(isRegistrationResultHandled({ step: 'REVIEW', requiresUser: false })).toBe(true);
  });
});
