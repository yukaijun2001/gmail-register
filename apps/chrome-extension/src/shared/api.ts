import type { ApiResponse } from '@gmail-manager/contracts';
import type { ExtensionSettings, WorkerIdentity } from './types';

export async function apiRequest<T>(
  settings: ExtensionSettings,
  path: string,
  options: RequestInit = {},
  identity?: WorkerIdentity,
): Promise<T> {
  const response = await fetch(`${settings.apiBaseUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(identity ? { authorization: `Bearer ${identity.workerToken}` } : {}),
      ...options.headers,
    },
  });
  const envelope = (await response.json()) as ApiResponse<T>;
  if (!envelope.success) throw new Error(`${envelope.error.code}: ${envelope.error.message}`);
  return envelope.data;
}
