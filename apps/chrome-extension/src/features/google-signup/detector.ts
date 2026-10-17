import type { RegistrationStep } from '@gmail-manager/contracts';
import { isVisible } from '../../shared/page-dom';
import { findBirthdayField, firstElement, selectors } from './selectors';

export interface Detection {
  step: RegistrationStep;
  requiresUser: boolean;
  reason?: string;
}

/**
 * Google embeds an invisible reCAPTCHA (badge/anchor with size=invisible, or a bare
 * [data-sitekey] host) on ordinary signup steps; only a rendered challenge counts.
 */
function hasInteractiveCaptcha(): boolean {
  for (const selector of selectors.captcha) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (element.closest('.grecaptcha-badge')) continue;
      if (element.getAttribute('data-size') === 'invisible') continue;
      if (element instanceof HTMLIFrameElement) {
        if (/[?&]size=invisible\b/.test(element.src)) continue;
      } else if (!element.querySelector('iframe')) {
        // A sitekey host without a rendered widget is the invisible/enterprise variant.
        continue;
      }
      if (isVisible(element)) return true;
    }
  }
  return false;
}

function isBirthdayPage(): boolean {
  const found = (['day', 'month', 'year', 'gender'] as const).filter((field) =>
    Boolean(findBirthdayField(field)),
  );
  // Day + year are the stable text inputs; month/gender pairs cover pages still painting inputs.
  return (
    (found.includes('day') && found.includes('year')) ||
    (found.includes('month') && found.includes('gender')) ||
    found.length >= 3
  );
}

function phoneInput(): HTMLInputElement | null {
  const birthdayInputs = new Set([findBirthdayField('day'), findBirthdayField('year')]);
  return (
    [...document.querySelectorAll<HTMLInputElement>(selectors.phone.join(','))].find(
      (input) => !birthdayInputs.has(input),
    ) || null
  );
}

export function detectStep(): Detection | null {
  // Known form steps win: Google keeps reCAPTCHA scripts/anchors mounted on regular steps,
  // so a CAPTCHA only blocks automation when no fillable form is present.
  // Birthday must run before phone detection: Google renders day/year as telephone inputs.
  if (isBirthdayPage()) return { step: 'BIRTHDAY_GENDER', requiresUser: false };
  if (phoneInput()) return { step: 'PHONE_VERIFICATION', requiresUser: false };
  if (firstElement<HTMLInputElement>(selectors.firstName))
    return { step: 'PERSONAL_INFO', requiresUser: false };
  if (firstElement<HTMLInputElement>(selectors.username))
    return { step: 'USERNAME', requiresUser: false };
  if (firstElement<HTMLInputElement>(selectors.password))
    return { step: 'PASSWORD', requiresUser: false };
  if (hasInteractiveCaptcha())
    return {
      step: 'ADDITIONAL_VERIFICATION',
      requiresUser: true,
      reason: 'CAPTCHA 需要用户完成',
    };
  const text = document.body?.innerText || '';
  if (/welcome|privacy and terms|review your account|欢迎|隐私权和条款/i.test(text))
    return { step: 'REVIEW', requiresUser: false, reason: 'Google 注册流程已完成' };
  return null;
}
