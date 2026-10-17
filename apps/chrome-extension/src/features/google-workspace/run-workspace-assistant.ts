import { browser } from 'wxt/browser';
import type { ActiveTask } from '../../shared/types';
import { controlLabel, isVisible } from '../../shared/page-dom';

export interface WorkspaceDetection {
  step: 'OPEN_SIGNUP';
  requiresUser: boolean;
  reason?: string;
}

function entryControls() {
  const controls = [
    ...document.querySelectorAll<HTMLElement>(
      'summary, a, button, [role="button"], [role="menuitem"]',
    ),
  ];
  const createControls = controls.filter(
    (element) =>
      isVisible(element) &&
      /^(create an account|创建账号|创建帐号|创建帐户|建立帳戶)$/i.test(controlLabel(element)),
  );
  const create =
    createControls.find((element) => element.closest('header, [role="banner"]')) ||
    createControls[0];
  const scope =
    create?.closest('details') || create?.closest('header, [role="banner"]') || document;
  const personal = [...scope.querySelectorAll<HTMLElement>('a, button, [role="menuitem"]')].find(
    (element) =>
      isVisible(element) && /for my personal use|个人使用|個人用途/i.test(controlLabel(element)),
  );
  return { create, personal };
}

export function workspacePageKey(): string {
  const { create, personal } = entryControls();
  return `${location.href}:${personal ? 'PERSONAL_USE' : create ? 'CREATE_ACCOUNT' : 'LOADING'}`;
}

export async function runWorkspaceAssistant(execute = true): Promise<WorkspaceDetection | null> {
  const { create, personal } = entryControls();
  if (!create && !personal) return null;
  const detection: WorkspaceDetection = {
    step: 'OPEN_SIGNUP',
    requiresUser: false,
    reason: personal ? '准备选择个人使用' : '准备打开创建账号菜单',
  };
  if (!execute) return detection;
  const task = (await browser.runtime.sendMessage({ type: 'GET_ACTIVE_TASK' })) as
    ActiveTask | undefined;
  if (!task) return null;
  await browser.runtime.sendMessage({ type: 'PAGE_STATE', ...detection });
  // Recheck immediately before acting: the pipeline may be paused while progress is syncing.
  if (!(await browser.runtime.sendMessage({ type: 'GET_ACTIVE_TASK' }))) return detection;
  if (personal) {
    if (personal instanceof HTMLAnchorElement) {
      const url = new URL(personal.href);
      if (url.origin !== 'https://accounts.google.com') return null;
      personal.target = '_self';
    }
    personal.click();
  } else if (
    create &&
    !create.closest('details')?.open &&
    create.getAttribute('aria-expanded') !== 'true'
  ) {
    create.click();
  }
  return detection;
}
