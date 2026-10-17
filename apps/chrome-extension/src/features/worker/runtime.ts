import { browser } from 'wxt/browser';
import type { RegenerateUsernameResult } from '@gmail-manager/contracts';
import { apiRequest } from '../../shared/api';
import { getState, setState } from '../../shared/storage';
import { isSignupUrl, isWorkspaceGmailUrl } from '../../shared/google-pages';
import type {
  ActiveTask,
  AccountPreview,
  ExtensionSettings,
  ExtensionState,
  PopupSnapshot,
  WorkerIdentity,
} from '../../shared/types';

const START_URL = 'https://workspace.google.com/intl/en-US/gmail/';
const API_PATH = '/api/v1';
const DISCOVERY_TIMEOUT_MS = 2500;
const LEASE_RENEWAL_LEAD_MS = 60_000;
const LOCAL_API_CANDIDATES = [
  'http://localhost:1001/api/v1',
  'http://localhost:3000/api/v1',
] as const;
const uuid = () => crypto.randomUUID();
type ConfiguredState = ExtensionState & { settings: ExtensionSettings };

type AutomationTabCandidate = { id?: number; active?: boolean };

export function leaseNeedsRenewal(leaseExpiresAt: string, now = Date.now()): boolean {
  const expiry = Date.parse(leaseExpiresAt);
  return !Number.isFinite(expiry) || expiry - now <= LEASE_RENEWAL_LEAD_MS;
}

/**
 * A registration flow may continue in a newly opened tab while storage still points at the
 * previous tab. Let the active Google content script reclaim the live task automatically;
 * background tabs are deliberately excluded so they cannot steal the worker session.
 */
export function shouldAdoptAutomationTab(
  state: Pick<ExtensionState, 'activeTask' | 'automationTabId' | 'paused'>,
  tab: AutomationTabCandidate | undefined,
  registeredTabIsUsable: boolean,
): boolean {
  const tabId = tab?.id;
  return Boolean(
    state.activeTask &&
      ['CLAIMED', 'RUNNING', 'WAITING_USER'].includes(state.activeTask.status) &&
      !state.paused &&
      tabId !== undefined &&
      tabId !== state.automationTabId &&
      (tab?.active === true || !registeredTabIsUsable),
  );
}

async function automationTabIsUsable(tabId: number | undefined): Promise<boolean> {
  if (tabId === undefined) return false;
  try {
    const tab = await browser.tabs.get(tabId);
    return isSignupUrl(tab.url) || isWorkspaceGmailUrl(tab.url);
  } catch {
    return false;
  }
}

function apiBaseFromTab(tab: { url?: string; title?: string }): string | undefined {
  try {
    if (!tab.url) return undefined;
    const url = new URL(tab.url);
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    if (url.hostname === 'accounts.google.com') return undefined;
    const isKnownPort = ['1001', '3000'].includes(url.port);
    const isAdminPage = tab.title?.includes('注册协作台') === true;
    if (!isKnownPort && !isAdminPage) return undefined;
    return `${url.origin}${API_PATH}`;
  } catch {
    return undefined;
  }
}

async function isHealthy(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { success?: boolean; data?: { status?: string } };
    return payload.success === true && payload.data?.status === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function discoverApiBaseUrl(preferred?: string): Promise<string> {
  const tabs = await browser.tabs.query({});
  const candidates = [
    ...tabs.map((tab) => apiBaseFromTab(tab)).filter((value): value is string => Boolean(value)),
    preferred,
    ...LOCAL_API_CANDIDATES,
  ].filter((value): value is string => Boolean(value));
  const uniqueCandidates = [...new Set(candidates)];
  for (const candidate of uniqueCandidates) {
    if (await isHealthy(candidate)) return candidate;
  }
  throw new Error('未找到后台服务，请先打开服务器的管理后台页面');
}

async function ensureApiSettings(): Promise<ConfiguredState> {
  const current = await getState();
  const apiBaseUrl = await discoverApiBaseUrl(current.settings?.apiBaseUrl);
  if (current.settings?.apiBaseUrl === apiBaseUrl) {
    return { ...current, settings: current.settings };
  }
  await setState({
    settings: { apiBaseUrl },
    identity: undefined,
    activeTask: undefined,
    automationTabId: undefined,
    paused: false,
    lastError: undefined,
  });
  await registerWorker({ apiBaseUrl });
  const next = await getState();
  if (!next.settings) throw new Error('后台服务同步失败');
  return { ...next, settings: next.settings };
}

async function requireConfigured() {
  const state = await ensureApiSettings();
  if (!state.identity) {
    await registerWorker(state.settings);
    return requireConfigured();
  }
  return { state, settings: state.settings, identity: state.identity };
}

async function registerWorker(settings: ExtensionSettings): Promise<void> {
  const current = await getState();
  const profileIdentifier = current.identity?.profileIdentifier || crypto.randomUUID();
  const identity = await apiRequest<WorkerIdentity & { id: string }>(
    settings,
    '/workers/register',
    {
      method: 'POST',
      body: JSON.stringify({
        profileIdentifier,
        extensionVersion: browser.runtime.getManifest().version,
      }),
    },
  );
  await setState({
    settings,
    identity: { workerId: identity.id, workerToken: identity.workerToken, profileIdentifier },
    lastError: undefined,
  });
}

async function saveSettings(settings: ExtensionSettings): Promise<void> {
  const apiBaseUrl = await discoverApiBaseUrl(settings.apiBaseUrl.trim());
  await setState({
    settings: { apiBaseUrl },
    identity: undefined,
    activeTask: undefined,
    automationTabId: undefined,
    paused: false,
  });
  await registerWorker({ apiBaseUrl });
}

async function claim(): Promise<ActiveTask | null> {
  const { settings, identity } = await requireConfigured();
  const task = await apiRequest<any>(
    settings,
    '/tasks/claim',
    { method: 'POST', body: '{}' },
    identity,
  );
  if (!task) return null;
  const activeTask: ActiveTask = {
    ...task,
    id: task.id,
    workerId: task.workerId,
    usernameRetryCount: 0,
    lastSyncTime: new Date().toISOString(),
  };
  await setState({ activeTask, automationTabId: undefined, paused: false, lastError: undefined });
  const [activeTab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (activeTab?.id && (isWorkspaceGmailUrl(activeTab.url) || isSignupUrl(activeTab.url))) {
    await setState({ automationTabId: activeTab.id });
    await browser.tabs.sendMessage(activeTab.id, { type: 'EXECUTE_PAGE' });
  } else {
    const tab = await browser.tabs.create({ url: START_URL, active: true });
    await setState({ automationTabId: tab.id });
  }
  return activeTask;
}

async function regenerateUsername(rejectedUsername: string): Promise<RegenerateUsernameResult> {
  const { state, settings, identity } = await requireConfigured();
  if (!state.activeTask) throw new Error('当前没有任务');
  const result = await apiRequest<RegenerateUsernameResult>(
    settings,
    `/tasks/${state.activeTask.id}/username/regenerate`,
    {
      method: 'POST',
      body: JSON.stringify({
        leaseToken: state.activeTask.leaseToken,
        leaseVersion: state.activeTask.leaseVersion,
        rejectedUsername,
        idempotencyKey: uuid(),
      }),
    },
    identity,
  );
  await setState({
    activeTask: {
      ...state.activeTask,
      status: result.status,
      account: { ...state.activeTask.account, desiredUsername: result.desiredUsername },
      usernameRetryCount: result.retryCount,
      lastSyncTime: new Date().toISOString(),
    },
    lastDetection: {
      step: 'USERNAME',
      requiresUser: result.requiresUser,
      reason: result.requiresUser
        ? `用户名连续冲突 ${result.retryCount} 次，请人工处理`
        : `用户名已自动更换（第 ${result.retryCount} 次）`,
    },
    lastError: result.requiresUser ? '用户名自动更换已达到 5 次上限' : undefined,
  });
  return result;
}

/** The pipeline reports its own outcome; no external step decides the result. */
async function reportResult(
  result: 'SUCCESS' | 'FAILED' | 'UNCERTAIN',
  message?: string,
): Promise<void> {
  const { state, settings, identity } = await requireConfigured();
  if (!state.activeTask) throw new Error('当前没有任务');
  await apiRequest(
    settings,
    `/tasks/${state.activeTask.id}/report-result`,
    {
      method: 'POST',
      body: JSON.stringify({
        leaseToken: state.activeTask.leaseToken,
        leaseVersion: state.activeTask.leaseVersion,
        result,
        message,
        idempotencyKey: uuid(),
      }),
    },
    identity,
  );
  if (result !== 'UNCERTAIN')
    await setState({ activeTask: undefined, automationTabId: undefined, paused: false });
}

async function getActiveTaskPassword(): Promise<{ password: string }> {
  const { state, settings, identity } = await requireConfigured();
  if (!state.activeTask) throw new Error('当前没有任务');
  return apiRequest<{ password: string }>(
    settings,
    `/tasks/${state.activeTask.id}/credentials?version=${state.activeTask.leaseVersion}`,
    { headers: { 'x-lease-token': state.activeTask.leaseToken } },
    identity,
  );
}

async function syncPopup(): Promise<PopupSnapshot> {
  const state = await ensureApiSettings();

  const accounts = await apiRequest<AccountPreview[]>(state.settings, '/admin/accounts');
  if (!state.activeTask || !state.identity) return { state, accounts };

  const task = await apiRequest<Pick<ActiveTask, 'account' | 'status' | 'currentStep'>>(
    state.settings,
    `/tasks/${state.activeTask.id}`,
    {},
    state.identity,
  );
  if (task.status === 'SUCCESS' || task.status === 'FAILED' || task.status === 'CANCELLED') {
    const next = await setState({
      activeTask: undefined,
      automationTabId: undefined,
      paused: false,
    });
    return { state: next, accounts };
  }
  const next = await setState({
    activeTask: {
      ...state.activeTask,
      account: task.account,
      status: task.status,
      currentStep: task.currentStep,
      lastSyncTime: new Date().toISOString(),
    },
  });
  return { state: next, accounts };
}

async function rerunOnActiveGoogleTab(
  messageType: 'EXECUTE_PAGE' | 'REDETECT_PAGE',
): Promise<NonNullable<ExtensionState['lastDetection']> | null> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  const isGoogleFlow = isSignupUrl(tab?.url) || isWorkspaceGmailUrl(tab?.url);
  if (!tab?.id || !isGoogleFlow) {
    throw new Error('请先打开 Gmail 工作区或 Google 注册页面');
  }
  await setState({ automationTabId: tab.id, paused: false });
  return browser.tabs.sendMessage(tab.id, { type: messageType });
}

async function applyPageDetection(
  detection: NonNullable<ExtensionState['lastDetection']> | null,
  syncProgress = true,
): Promise<ExtensionState> {
  if (!detection) {
    return setState({
      lastDetection: undefined,
      lastError: '当前 Google 页面无法识别，请切换到注册流程页面后重试',
    });
  }

  const state = await getState();
  const live = Boolean(state.activeTask) && !state.paused;
  // The pipeline closes its own loop: reaching the final page means the account already exists.
  if (syncProgress && live && detection.step === 'REVIEW') {
    await reportResult('SUCCESS', 'Google 注册流程已完成');
    return getState();
  }
  if (syncProgress && live) {
    await reportProgress(detection.step, detection.requiresUser, detection.reason);
  }
  const next = await getState();
  return setState({
    lastDetection: detection,
    lastError: undefined,
    activeTask: next.activeTask ? { ...next.activeTask, currentStep: detection.step } : undefined,
  });
}

async function reportProgress(
  step: ActiveTask['currentStep'],
  requiresUser: boolean,
  message?: string,
): Promise<void> {
  const { state, settings, identity } = await requireConfigured();
  if (!state.activeTask || state.paused) return;
  const status = requiresUser
    ? 'WAITING_USER'
    : state.activeTask.status === 'CLAIMED' || state.activeTask.status === 'WAITING_USER'
      ? 'RUNNING'
      : state.activeTask.status;
  if (
    state.activeTask.currentStep === step &&
    state.activeTask.status === status &&
    state.lastDetection?.reason === message &&
    state.lastDetection?.requiresUser === requiresUser
  )
    return;
  await apiRequest(
    settings,
    `/tasks/${state.activeTask.id}/progress`,
    {
      method: 'POST',
      body: JSON.stringify({
        leaseToken: state.activeTask.leaseToken,
        leaseVersion: state.activeTask.leaseVersion,
        status,
        step,
        message,
        idempotencyKey: uuid(),
      }),
    },
    identity,
  );
  const latest = await getState();
  if (latest.activeTask?.id !== state.activeTask.id) return;
  await setState({
    activeTask: {
      ...latest.activeTask,
      status,
      currentStep: step,
      lastSyncTime: new Date().toISOString(),
    },
    lastDetection: { step, requiresUser, reason: message },
    lastError: undefined,
  });
}

async function renew(): Promise<void> {
  const { state, settings, identity } = await requireConfigured();
  if (!state.activeTask || state.paused) return;
  const lease = await apiRequest<{ leaseExpiresAt: string }>(
    settings,
    `/tasks/${state.activeTask.id}/renew`,
    {
      method: 'POST',
      body: JSON.stringify({
        leaseToken: state.activeTask.leaseToken,
        leaseVersion: state.activeTask.leaseVersion,
      }),
    },
    identity,
  );
  await setState({
    activeTask: {
      ...state.activeTask,
      leaseExpiresAt: lease.leaseExpiresAt,
      lastSyncTime: new Date().toISOString(),
    },
  });
}

async function heartbeat(): Promise<void> {
  const state = await getState();
  if (!state.settings || !state.identity) return;
  await apiRequest(
    state.settings,
    '/workers/heartbeat',
    {
      method: 'POST',
      body: JSON.stringify({
        status: state.paused ? 'PAUSED' : state.activeTask ? 'BUSY' : 'IDLE',
        currentTaskId: state.activeTask?.id || null,
      }),
    },
    state.identity,
  );
}

export function startWorkerRuntime(): void {
  const scheduleAlarms = () => {
    void browser.alarms.create('worker-heartbeat', { periodInMinutes: 1 });
    void browser.alarms.create('task-renew', { periodInMinutes: 1 });
  };
  // A Manifest V3 service worker can restart without onInstalled firing. Recreate alarms every
  // time the runtime boots, and try an immediate recovery for a lease that expired while asleep.
  scheduleAlarms();
  browser.runtime.onInstalled.addListener(scheduleAlarms);
  void renew().catch(async (error) =>
    setState({ lastError: error instanceof Error ? error.message : '任务续租失败' }),
  );
  browser.alarms.onAlarm.addListener((alarm) => {
    const action =
      alarm.name === 'worker-heartbeat'
        ? heartbeat()
        : alarm.name === 'task-renew'
          ? renew()
          : Promise.resolve();
    void action.catch(async (error) =>
      setState({
        lastError: error instanceof Error ? error.message : '后台同步失败',
      }),
    );
  });
  browser.runtime.onMessage.addListener((message: any, sender) => {
    return (async () => {
      if (message.type === 'GET_STATE') return getState();
      if (message.type === 'SYNC_POPUP') return syncPopup();
      if (message.type === 'SAVE_SETTINGS') {
        await saveSettings(message.settings);
        return getState();
      }
      if (message.type === 'CLAIM') {
        await claim();
        return getState();
      }
      if (message.type === 'EXECUTE') {
        const current = await getState();
        if (current.activeTask) {
          const lastDetection = await rerunOnActiveGoogleTab('EXECUTE_PAGE');
          await applyPageDetection(lastDetection, false);
        } else await claim();
        return getState();
      }
      if (message.type === 'REDETECT_PAGE') {
        const lastDetection = await rerunOnActiveGoogleTab('REDETECT_PAGE');
        await applyPageDetection(lastDetection);
        return getState();
      }
      if (message.type === 'SET_PAUSED') {
        await setState({ paused: Boolean(message.paused) });
        if (!message.paused) {
          const state = await getState();
          if (state.automationTabId)
            await browser.tabs.sendMessage(state.automationTabId, { type: 'EXECUTE_PAGE' });
        }
        return getState();
      }
      if (message.type === 'REPORT_RESULT') {
        await reportResult(message.result, message.message);
        return getState();
      }
      if (message.type === 'REGENERATE_USERNAME') {
        return regenerateUsername(String(message.rejectedUsername || ''));
      }
      if (message.type === 'GET_PASSWORD_FOR_DISPLAY') return getActiveTaskPassword();
      const isGooglePage = isSignupUrl(sender.tab?.url) || isWorkspaceGmailUrl(sender.tab?.url);
      if (!isGooglePage) throw new Error('拒绝非 Google 官方页面的高权限消息');
      let state = await getState();
      if (
        message.type === 'GET_ACTIVE_TASK' &&
        state.activeTask &&
        !state.paused &&
        leaseNeedsRenewal(state.activeTask.leaseExpiresAt)
      ) {
        await renew();
        state = await getState();
      }
      const registeredTabIsUsable =
        state.automationTabId === sender.tab?.id
          ? true
          : await automationTabIsUsable(state.automationTabId);
      if (shouldAdoptAutomationTab(state, sender.tab, registeredTabIsUsable)) {
        await setState({ automationTabId: sender.tab!.id });
        state = { ...state, automationTabId: sender.tab!.id };
      }
      const isAutomationTab =
        sender.tab?.id !== undefined && sender.tab.id === state.automationTabId;
      if (message.type === 'PAGE_STATE') {
        if (!isAutomationTab || state.paused) return { ok: false };
        // The pipeline closes its own loop: reaching the final page means the account exists.
        if (message.step === 'REVIEW') {
          await reportResult('SUCCESS', 'Google 注册流程已完成');
          return { ok: true };
        }
        await reportProgress(message.step, message.requiresUser, message.reason);
        return { ok: true };
      }
      if (message.type === 'ASSISTANT_ERROR') {
        if (!isAutomationTab || state.paused) return { ok: false };
        await setState({ lastError: String(message.message || '页面自动化失败') });
        return { ok: true };
      }
      if (message.type === 'GET_ACTIVE_TASK') {
        return state.paused ||
          !isAutomationTab ||
          !['CLAIMED', 'RUNNING', 'WAITING_USER'].includes(state.activeTask?.status || '')
          ? undefined
          : state.activeTask;
      }
      if (message.type === 'GET_PASSWORD') {
        if (!isAutomationTab || state.paused) throw new Error('任务未运行或已暂停');
        return getActiveTaskPassword();
      }
      return undefined;
    })().catch(async (error) => {
      const messageText = error instanceof Error ? error.message : '操作失败';
      await setState({ lastError: messageText });
      throw error;
    });
  });
}
