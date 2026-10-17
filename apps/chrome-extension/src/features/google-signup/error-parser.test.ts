// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readVisibleError } from './error-parser';

describe('visible Google form errors', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
      { width: 100, height: 20 },
    ] as unknown as DOMRectList);
  });

  it('ignores the aria-hidden page announcement on the birthday page', () => {
    document.body.innerHTML = `
      <div aria-live="assertive" aria-relevant="additions" aria-atomic="true"
           aria-hidden="true"
           style="color: transparent; z-index: -1; position: absolute; top: 0; left: 0">
        <div aria-atomic="true">Basic information Enter your birthday and gender</div>
      </div>`;

    expect(readVisibleError()).toBeUndefined();
  });

  it('returns a rendered form validation alert', () => {
    document.body.innerHTML = '<div role="alert">Enter a valid day</div>';

    expect(readVisibleError()).toBe('Enter a valid day');
  });
});
