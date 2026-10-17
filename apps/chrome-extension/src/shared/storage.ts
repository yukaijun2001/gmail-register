import { browser } from 'wxt/browser';
import type { ExtensionState } from './types';

const KEY = 'gmail-manager-state';
const DEFAULT_STATE: ExtensionState = { paused: false };

export async function getState(): Promise<ExtensionState> {
  const result = await browser.storage.local.get(KEY);
  return { ...DEFAULT_STATE, ...(result[KEY] as ExtensionState | undefined) };
}

export async function setState(patch: Partial<ExtensionState>): Promise<ExtensionState> {
  const next = { ...(await getState()), ...patch };
  await browser.storage.local.set({ [KEY]: next });
  return next;
}
