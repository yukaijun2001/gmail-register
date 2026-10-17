import type { RegistrationStep } from '@gmail-manager/contracts';
import type { ActiveTask } from '../../shared/types';
import { controlLabel, isVisible, ownText } from '../../shared/page-dom';
import { findBirthdayField, firstElement, selectors, type BirthdayField } from './selectors';

function setValue(element: HTMLInputElement | HTMLSelectElement, value: string): void {
  const prototype =
    element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const CHINESE_MONTHS = [
  '一',
  '二',
  '三',
  '四',
  '五',
  '六',
  '七',
  '八',
  '九',
  '十',
  '十一',
  '十二',
] as const;

const GENDER_LABELS: Record<string, readonly string[]> = {
  FEMALE: ['Female', '女性', '女'],
  MALE: ['Male', '男性', '男'],
  UNDISCLOSED: ['Rather not say', 'Prefer not to say', '不愿透露', '保密'],
  // Google's "Custom" opens two extra required fields (custom gender + pronoun) the account
  // data does not have, so OTHER is entered as "Rather not say" to keep the flow automatic.
  OTHER: ['Rather not say', 'Prefer not to say', '不愿透露', '保密'],
};

function normalized(value?: string | null): string {
  return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** Whole-token containment, so "male" does not match "female" and "may" not "mayo". */
function containsToken(text: string, token: string): boolean {
  if (!token) return false;
  for (let index = text.indexOf(token); index >= 0; index = text.indexOf(token, index + 1)) {
    const before = text[index - 1];
    const after = text[index + token.length];
    if ((!before || !LETTER_OR_DIGIT.test(before)) && (!after || !LETTER_OR_DIGIT.test(after)))
      return true;
  }
  return false;
}

/** Does an option element carry exactly one of the expected labels? */
function matchesLabel(element: Element, labels: readonly string[]): boolean {
  const expected = labels.map(normalized);
  const candidates = [
    element.getAttribute('aria-valuetext'),
    element.getAttribute('aria-label'),
    element.textContent,
  ].map(normalized);
  return candidates.some((candidate) => candidate && expected.includes(candidate));
}

function byIds(ids: string | null): HTMLElement[] {
  return (ids || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id))
    .filter((element): element is HTMLElement => Boolean(element));
}

const OPTION_SELECTOR = '[role="option"], [role="menuitem"], [data-value], option, li';

function hasOptions(root: Element): boolean {
  return Boolean(root.querySelector(OPTION_SELECTOR));
}

/** Field caption such as "Month"/"Gender": first aria-labelledby node, else aria-label. */
function comboboxCaption(combobox: HTMLElement): string {
  const [first] = byIds(combobox.getAttribute('aria-labelledby'));
  return normalized(first?.textContent || combobox.getAttribute('aria-label'));
}

/**
 * The listbox that belongs to this combobox. Google's Material select points aria-controls at
 * an empty, display:none placeholder and renders the real <ul role="listbox" aria-label="Month">
 * elsewhere, so aria-controls is only trusted when it actually contains options.
 */
function comboboxListboxes(combobox: HTMLElement): HTMLElement[] {
  const owned = byIds(
    `${combobox.getAttribute('aria-controls') || ''} ${combobox.getAttribute('aria-owns') || ''}`,
  ).filter(hasOptions);
  if (owned.length) return owned;

  // Same field wrapper: climb until the ancestor would also contain another combobox.
  for (
    let container = combobox.parentElement, depth = 0;
    container && depth < 5;
    container = container.parentElement, depth++
  ) {
    if (container.querySelectorAll('[role="combobox"]').length > 1) break;
    const local = [...container.querySelectorAll<HTMLElement>('[role="listbox"]')].filter(
      hasOptions,
    );
    if (local.length) return local;
  }

  const all = [...document.querySelectorAll<HTMLElement>('[role="listbox"]')].filter(hasOptions);
  const caption = comboboxCaption(combobox);
  const named = all.filter((listbox) => {
    const name = normalized(
      listbox.getAttribute('aria-label') ||
        byIds(listbox.getAttribute('aria-labelledby'))
          .map((label) => label.textContent)
          .join(' '),
    );
    return Boolean(caption && name === caption);
  });
  if (named.length) return named;
  // Last resort: an unnamed menu is only attributable when it is the single one open.
  const open = all.filter(isVisible);
  return open.length === 1 ? open : [];
}

/**
 * Options of this combobox's open listbox. Google sometimes gives the listbox a layout box
 * while its option leaves do not have one, so only the listbox is checked for visibility.
 */
function visibleOptions(combobox: HTMLElement): HTMLElement[] {
  const roots = comboboxListboxes(combobox).filter(isVisible);
  const candidates = roots.flatMap((root) => [
    ...root.querySelectorAll<HTMLElement>(OPTION_SELECTOR),
  ]);
  return [...new Set(candidates)];
}

function findOption(
  combobox: HTMLElement,
  value: string,
  labels: readonly string[],
): HTMLElement | null {
  const options = visibleOptions(combobox);
  return (
    options.find((option) => matchesLabel(option, labels)) ||
    options.find((option) => option.getAttribute('data-value') === value) ||
    null
  );
}

function isComboboxOpen(combobox: HTMLElement): boolean {
  if (combobox.getAttribute('aria-expanded') === 'true') return true;
  return comboboxListboxes(combobox).some(isVisible);
}

/**
 * Text currently shown as the combobox value. Google keeps it in an aria-hidden span that is
 * referenced as the second aria-labelledby id ("c23 c24" = caption + value), so it has to be
 * read through aria-labelledby; ownText() deliberately skips aria-hidden nodes.
 */
function comboboxDisplay(combobox: HTMLElement): string {
  const labelledBy = byIds(combobox.getAttribute('aria-labelledby'));
  const valueNodes = labelledBy.length > 1 ? labelledBy.slice(1) : [];
  return normalized(
    [...valueNodes.map((node) => node.textContent || ''), ownText(combobox)].join(' '),
  );
}

/**
 * Has the combobox committed the expected choice? Reads the displayed value, a data-value
 * mirror, or the aria-selected option of its (closed) listbox. A highlighted option in an
 * open menu never counts.
 */
function comboboxHasValue(combobox: HTMLElement, value: string, labels: readonly string[]) {
  if (combobox.getAttribute('data-value') === value) return true;
  const display = comboboxDisplay(combobox);
  if (labels.some((label) => containsToken(display, normalized(label)))) return true;
  if (isComboboxOpen(combobox)) return false;
  return comboboxListboxes(combobox).some((root) => {
    const selected = root.querySelector('[role="option"][aria-selected="true"]');
    return Boolean(selected && matchesLabel(selected, labels));
  });
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function waitUntil(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) return false;
    await sleep(50);
  }
  return true;
}

function mouseSequence(element: HTMLElement, withClick: boolean): void {
  const init = { bubbles: true, cancelable: true, composed: true };
  const Pointer = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
  element.dispatchEvent(new Pointer('pointerdown', init));
  element.dispatchEvent(new MouseEvent('mousedown', init));
  element.dispatchEvent(new Pointer('pointerup', init));
  element.dispatchEvent(new MouseEvent('mouseup', init));
  if (withClick) element.dispatchEvent(new MouseEvent('click', init));
}

function closeCombobox(combobox: HTMLElement): void {
  if (!isComboboxOpen(combobox)) return;
  const escape = { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true };
  const target = (document.activeElement as HTMLElement | null) || combobox;
  target.dispatchEvent(new KeyboardEvent('keydown', escape));
  target.dispatchEvent(new KeyboardEvent('keyup', escape));
  combobox.blur();
}

/**
 * Opens the menu with exactly one gesture per attempt. Firing mousedown and click together
 * toggles some Material selects open and immediately closed again.
 */
async function openCombobox(combobox: HTMLElement): Promise<boolean> {
  if (isComboboxOpen(combobox)) return true;
  const attempts = [() => combobox.click(), () => mouseSequence(combobox, false)];
  for (const attempt of attempts) {
    combobox.focus();
    attempt();
    if (await waitUntil(() => isComboboxOpen(combobox), 800)) return true;
  }
  return false;
}

/**
 * Google mirrors a custom select into a hidden native <select>/<input> for form submission.
 * When present, it is the most reliable signal that the choice was committed.
 */
function mirrorHasValue(field: BirthdayField, value: string, labels: readonly string[]): boolean {
  for (const selector of selectors[field]) {
    for (const element of document.querySelectorAll(selector)) {
      if (element instanceof HTMLSelectElement) {
        const option = element.selectedOptions[0];
        if (option && !option.disabled && (option.value === value || matchesLabel(option, labels)))
          return true;
      } else if (element instanceof HTMLInputElement && element.type === 'hidden') {
        if (element.value === value) return true;
      }
    }
  }
  return false;
}

async function setComboboxValue(
  field: BirthdayField,
  combobox: HTMLElement,
  value: string,
  labels: readonly string[],
): Promise<boolean> {
  const committed = () =>
    comboboxHasValue(combobox, value, labels) || mirrorHasValue(field, value, labels);
  // Already committed: never reopen it. Reopening a filled field on every retry is what made
  // the page bounce between Month and Gender.
  if (committed()) {
    closeCombobox(combobox);
    return true;
  }
  const activations = [
    (option: HTMLElement) => option.click(),
    (option: HTMLElement) => mouseSequence(option, true),
  ];
  // No Enter-key fallback: Google's list commits the item that holds keyboard focus (the
  // first one, January), not the event target, which is how a wrong month got selected.
  for (const activate of activations) {
    if (!(await openCombobox(combobox))) break;
    let option: HTMLElement | null = null;
    await waitUntil(() => Boolean((option = findOption(combobox, value, labels))), 1500);
    if (!option) break;
    activate(option);
    if (await waitUntil(committed, 1000)) {
      await waitUntil(() => !isComboboxOpen(combobox), 500);
      return true;
    }
  }
  // Leave no menu open behind us, otherwise the next control's click only closes this one.
  closeCombobox(combobox);
  return false;
}

function setSelectValue(element: HTMLSelectElement, value: string, labels: readonly string[]) {
  // Option text is authoritative; the numeric value is only a fallback for unlabeled options.
  const option =
    [...element.options].find((candidate) => matchesLabel(candidate, labels)) ||
    [...element.options].find((candidate) => candidate.value === value);
  if (!option) return false;
  if (element.value !== option.value) setValue(element, option.value);
  return element.value === option.value;
}

/** Selects a value in either a native <select> or a Google role="combobox" control. */
async function setChoice(
  field: BirthdayField,
  value: string,
  labels: readonly string[],
): Promise<boolean> {
  const element = findBirthdayField(field);
  if (!element) return false;
  if (element instanceof HTMLSelectElement) return setSelectValue(element, value, labels);
  return setComboboxValue(field, element, value, labels);
}

/** Reads a choice without opening or changing the control. */
function choiceHasValue(
  field: BirthdayField,
  value: string,
  labels: readonly string[],
): boolean {
  const element = findBirthdayField(field);
  if (!element) return false;
  if (element instanceof HTMLSelectElement) {
    const option = element.selectedOptions[0];
    return Boolean(
      option && !option.disabled && (option.value === value || matchesLabel(option, labels)),
    );
  }
  return comboboxHasValue(element, value, labels) || mirrorHasValue(field, value, labels);
}

/** Birth years entered into Google are capped at 2003 (inclusive). */
export const MAX_BIRTH_YEAR = 2003;

/**
 * Year to enter for an account birthday. Years after 2003 are moved back by the smallest
 * multiple of 4 that reaches 2003 or earlier: deterministic, so retries always type the same
 * value, and leap-year status is kept, so Feb 29 stays a valid date.
 */
export function registrationYear(year: number): number {
  if (year <= MAX_BIRTH_YEAR) return year;
  return year - 4 * Math.ceil((year - MAX_BIRTH_YEAR) / 4);
}

export function replaceUsername(value: string): boolean {
  const element = firstElement<HTMLInputElement>(selectors.username);
  if (!element) return false;
  setValue(element, value);
  return true;
}

export interface FillResult {
  filled: string[];
  missing: string[];
}

export async function fillKnownFields(
  task: ActiveTask,
  password: string | undefined,
  step: RegistrationStep,
  interact = true,
): Promise<FillResult> {
  const filled: string[] = [];
  const missing: string[] = [];
  const put = (name: string, candidates: readonly string[], value?: string) => {
    const element = firstElement<HTMLInputElement | HTMLSelectElement>(candidates);
    const isPlaceholder =
      element instanceof HTMLSelectElement &&
      (element.value === '' ||
        element.value === '0' ||
        element.selectedOptions[0]?.disabled === true);
    if (interact && element && value && (!element.value || isPlaceholder)) {
      setValue(element, value);
      filled.push(name);
    }
    if (!element || !element.value) missing.push(name);
  };
  /** Fills a text input with the account value, replacing stale or partial input. */
  const fillText = (name: string, element: HTMLElement | null, value: string) => {
    if (!(element instanceof HTMLInputElement)) {
      missing.push(name);
      return;
    }
    if (interact && element.value !== value) {
      element.focus();
      setValue(element, value);
      element.dispatchEvent(new Event('blur'));
    }
    (element.value === value ? filled : missing).push(name);
  };

  if (step === 'PERSONAL_INFO') {
    put('firstName', selectors.firstName, task.account.firstName);
    put('lastName', selectors.lastName, task.account.lastName);
  }
  const birthday = new Date(task.account.birthday);
  // Fallback option values only; option labels are matched first.
  const genderMap: Record<string, string> = {
    FEMALE: '1',
    MALE: '2',
    UNDISCLOSED: '3',
    OTHER: '3',
  };

  if (step === 'BIRTHDAY_GENDER') {
    if (Number.isNaN(birthday.getTime())) {
      missing.push('birthday');
      return { filled, missing };
    }
    const month = birthday.getUTCMonth() + 1;
    const monthValues = [
      String(month),
      MONTH_LABELS[month - 1] ?? String(month),
      MONTH_LABELS[month - 1]?.slice(0, 3) ?? String(month),
      `${month}月`,
      `${CHINESE_MONTHS[month - 1]}月`,
    ];
    fillText('day', findBirthdayField('day'), String(birthday.getUTCDate()));
    const year = registrationYear(birthday.getUTCFullYear());
    fillText('year', findBirthdayField('year'), String(year));

    // Dropdowns are handled one at a time: if Month did not commit, do not open Gender in
    // the same pass, otherwise the two menus fight over focus.
    const monthSet = interact
      ? await setChoice('month', String(month), monthValues)
      : choiceHasValue('month', String(month), monthValues);
    if (!monthSet) {
      missing.push('month');
      return { filled, missing };
    }
    filled.push('month');

    const genderValue = genderMap[task.account.gender] ?? '3';
    const genderLabels = GENDER_LABELS[task.account.gender] ?? GENDER_LABELS.UNDISCLOSED ?? [];
    const genderSet = interact
      ? await setChoice('gender', genderValue, genderLabels)
      : choiceHasValue('gender', genderValue, genderLabels);
    (genderSet ? filled : missing).push('gender');
  }

  if (step === 'USERNAME') put('username', selectors.username, task.account.desiredUsername);
  if (step === 'PHONE_VERIFICATION') put('phone', selectors.phone, task.account.phoneReference);
  if (step === 'PASSWORD' && password) {
    put('password', selectors.password, password);
    put('confirmPassword', selectors.confirmPassword, password);
  }
  return { filled, missing };
}

function findNextButton(): HTMLElement | null {
  const scoped = document.querySelectorAll<HTMLElement>(
    '#birthdaygenderNext button, #birthdaygenderNext [role="button"], ' + 'button[jsname="LgbsSe"]',
  );
  const generic = document.querySelectorAll<HTMLElement>(
    'button, [role="button"], input[type="submit"], input[type="button"]',
  );
  const candidates = [...new Set([...scoped, ...generic])];
  return (
    candidates.find((element) => {
      if (
        !isVisible(element) ||
        element.hasAttribute('disabled') ||
        (element instanceof HTMLButtonElement && element.disabled) ||
        element.getAttribute('aria-disabled') === 'true' ||
        element.getAttribute('data-disabled') === 'true'
      )
        return false;
      const label = controlLabel(element).toLowerCase();
      return /^(next|下一步|继续)(\b|\s|$)/i.test(label) || /\b(next|continue)\b/i.test(label);
    }) || null
  );
}

/**
 * Google updates the Material button's disabled state asynchronously after the last input
 * event. Poll briefly so a valid form is not abandoned during that transition.
 */
export async function clickNextButton(): Promise<boolean> {
  await waitUntil(() => findNextButton() !== null, 1500);
  const button = findNextButton();
  if (!button) return false;
  button.focus();
  button.click();
  return true;
}
