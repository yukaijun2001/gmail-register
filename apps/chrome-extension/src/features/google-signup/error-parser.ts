import { selectors } from './selectors';
import { isVisible } from '../../shared/page-dom';

const USERNAME_UNAVAILABLE_PATTERNS = [
  /that username is taken/i,
  /username (?:is )?(?:already )?(?:taken|in use|unavailable|not available)/i,
  /try another username/i,
  /用户名.*(?:已被使用|已有人使用|不可用|已占用)/,
  /(?:尝试|请使用|请换)(?:其他|另一个).*用户名/,
] as const;

export function isUsernameUnavailable(message: string): boolean {
  return USERNAME_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(message));
}

export function readVisibleError(): string | undefined {
  for (const selector of selectors.visibleError) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      const text = (element.innerText || element.textContent || '').trim();
      if (text && isVisible(element)) return text.slice(0, 300);
    }
  }
  return undefined;
}
