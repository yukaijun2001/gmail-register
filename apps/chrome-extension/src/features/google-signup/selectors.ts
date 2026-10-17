import { accessibleName, isUsable, isVisible } from '../../shared/page-dom';

export const selectors = {
  firstName: ['input[name="firstName"]'],
  lastName: ['input[name="lastName"]'],
  day: [
    'input[name="day"]',
    'input#day',
    'input[autocomplete="bday-day"]',
    'input[placeholder="Day" i]',
    'input[aria-label="Day" i]',
  ],
  month: [
    'select[name="month"]',
    'select#month',
    'select[autocomplete="bday-month"]',
    'select[aria-label="Month" i]',
    '[role="combobox"]#month',
    '[role="combobox"][aria-label="Month" i]',
    '[role="combobox"][aria-labelledby*="month" i]',
  ],
  year: [
    'input[name="year"]',
    'input#year',
    'input[autocomplete="bday-year"]',
    'input[placeholder="Year" i]',
    'input[aria-label="Year" i]',
  ],
  gender: [
    'select[name="gender"]',
    'select#gender',
    'select[autocomplete="sex"]',
    'select[aria-label="Gender" i]',
    '[role="combobox"]#gender',
    '[role="combobox"][aria-label="Gender" i]',
    '[role="combobox"][aria-labelledby*="gender" i]',
  ],
  username: ['input[name="Username"]', 'input[name="username"]'],
  password: ['input[name="Passwd"]', 'input[name="password"]'],
  confirmPassword: ['input[name="PasswdAgain"]', 'input[name="confirmPassword"]'],
  phone: ['input[type="tel"]'],
  captcha: ['iframe[src*="recaptcha"]', '[data-sitekey]'],
  visibleError: ['[aria-live="assertive"]', '[role="alert"]'],
} as const;

export function firstElement<T extends Element>(candidates: readonly string[]): T | null {
  for (const selector of candidates) {
    const found = document.querySelector<T>(selector);
    if (found) return found;
  }
  return null;
}

export type BirthdayField = 'day' | 'month' | 'year' | 'gender';

/** Accessible-name patterns for birthday controls whose label lives outside the control. */
const FIELD_LABELS: Record<BirthdayField, RegExp> = {
  day: /^(?:day|日|天|日期)$|\bday\b/i,
  month: /^(?:month|月|月份)$|\bmonth\b/i,
  year: /^(?:year|年|年份)$|\byear\b/i,
  gender: /\bgender\b|\bsex\b|^性别$|^性別$/i,
};

const FIELD_CONTROLS: Record<BirthdayField, string> = {
  day: 'input:not([type]), input[type="text"], input[type="tel"], input[type="number"]',
  year: 'input:not([type]), input[type="text"], input[type="tel"], input[type="number"]',
  month: 'select, [role="combobox"]',
  gender: 'select, [role="combobox"]',
};

/**
 * Locates a birthday/gender control by stable attributes first, then by its accessible
 * name (aria-labelledby, external <label>, Material field caption). A rendered control
 * always wins over a hidden native fallback; when nothing is laid out yet (page still
 * painting), the first usable candidate is returned.
 */
export function findBirthdayField(field: BirthdayField): HTMLElement | null {
  const byAttribute = selectors[field].flatMap((selector) => [
    ...document.querySelectorAll<HTMLElement>(selector),
  ]);
  const pattern = FIELD_LABELS[field];
  const byLabel = [...document.querySelectorAll<HTMLElement>(FIELD_CONTROLS[field])].filter(
    (element) => pattern.test(accessibleName(element)),
  );
  const usable = [...new Set([...byAttribute, ...byLabel])].filter(isUsable);
  return usable.find(isVisible) || usable[0] || null;
}
