import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { IconPlayerPause, IconPlayerPlay, IconRefresh } from '@tabler/icons-react';
import type { AccountPreview, ActiveTask, ExtensionState, PopupSnapshot } from '../../shared/types';
import './style.css';

const GENDER_LABELS: Record<string, string> = {
  FEMALE: '女性',
  MALE: '男性',
  OTHER: '其他',
  UNDISCLOSED: '不披露',
};

function AccountDetails({
  account,
  password,
  onRegenerate,
  canRegenerate = false,
}: {
  account: ActiveTask['account'];
  password: string;
  onRegenerate?: () => void;
  canRegenerate?: boolean;
}) {
  return (
    <dl className="account-details">
      <div>
        <dt>姓名</dt>
        <dd>
          {account.firstName} {account.lastName}
        </dd>
      </div>
      <div>
        <dt>出生日期</dt>
        <dd>{String(account.birthday).slice(0, 10)}</dd>
      </div>
      <div>
        <dt>性别</dt>
        <dd>{GENDER_LABELS[account.gender] || account.gender}</dd>
      </div>
      <div>
        <dt>Gmail 用户名</dt>
        <dd className="username-value">
          <span>{account.desiredUsername}@gmail.com</span>
          {onRegenerate && (
            <button
              type="button"
              title="换一个用户名"
              aria-label="换一个用户名"
              disabled={!canRegenerate}
              onClick={onRegenerate}
            >
              <IconRefresh size={13} />
            </button>
          )}
        </dd>
      </div>
      <div>
        <dt>注册密码</dt>
        <dd>{password}</dd>
      </div>
      <div>
        <dt>手机号</dt>
        <dd>{account.phoneReference || '-'}</dd>
      </div>
    </dl>
  );
}

export function PopupApp() {
  const [state, setState] = useState<ExtensionState>({ paused: false });
  const [accounts, setAccounts] = useState<AccountPreview[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const applyState = async (next: ExtensionState): Promise<ExtensionState> => {
    setState(next);
    if (!next.activeTask) {
      setPassword('');
      return next;
    }
    try {
      const credentials = (await browser.runtime.sendMessage({
        type: 'GET_PASSWORD_FOR_DISPLAY',
      })) as { password: string };
      setPassword(credentials.password);
    } catch {
      setPassword('暂不可用');
    }
    return next;
  };

  const load = async (): Promise<ExtensionState> => {
    const snapshot = (await browser.runtime.sendMessage({ type: 'SYNC_POPUP' })) as PopupSnapshot;
    setAccounts(snapshot.accounts);
    return applyState(snapshot.state);
  };
  useEffect(() => {
    void load().catch((error) =>
      setMessage(error instanceof Error ? error.message : '同步资料失败'),
    );
    const interval = window.setInterval(() => void load().catch(() => {}), 10_000);
    return () => window.clearInterval(interval);
  }, []);

  const act = async (message: unknown) => {
    setBusy(true);
    setMessage('');
    try {
      await applyState(await browser.runtime.sendMessage(message));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const regenerateUsername = async () => {
    if (!state.activeTask) return;
    setBusy(true);
    setMessage('');
    try {
      const result = (await browser.runtime.sendMessage({
        type: 'REGENERATE_USERNAME',
        rejectedUsername: state.activeTask.account.desiredUsername,
      })) as { desiredUsername: string; retryCount: number; requiresUser: boolean };
      await load();
      setMessage(result.requiresUser ? '自动换名次数已达上限，请人工处理' : '已自动生成新用户名');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '用户名更换失败');
    } finally {
      setBusy(false);
    }
  };
  const selectedAccount = accounts.find((account) => account.id === selectedId) || accounts[0];
  return (
    <main>
      <header>
        <div>
          <span>GMAIL WORKER</span>
          <h1>注册辅助</h1>
        </div>
      </header>
      <section className="configuration">
        <label>后台服务</label>
        <strong>{state.settings?.apiBaseUrl || '自动识别中...'}</strong>
        <small>自动读取已打开的后台地址，本机优先使用 localhost:1001</small>
      </section>
      <section className="identity">
        <label>Worker</label>
        <strong>{state.identity?.workerId.slice(0, 12) || '尚未连接'}</strong>
        <small>
          {state.lastDetection
            ? `页面：${state.lastDetection.step}${state.lastDetection.requiresUser ? '（需人工）' : ''}`
            : state.identity
              ? '已连接'
              : '等待 API 连接'}
        </small>
      </section>
      {(state.lastError || message) && (
        <p className={state.lastError ? 'error' : 'notice'} role="status">
          {state.lastError || message}
        </p>
      )}
      <div className="actions top-actions">
        <button
          className="primary"
          disabled={busy || !state.identity}
          onClick={() => act({ type: 'EXECUTE' })}
        >
          <IconPlayerPlay size={18} />
          执行
        </button>
        <button disabled={busy} onClick={() => act({ type: 'REDETECT_PAGE' })}>
          <IconRefresh size={17} />
          重新检测页面
        </button>
      </div>
      {state.activeTask ? (
        <>
          <section className="task">
            <div className="task-heading">
              <label>当前任务</label>
              <strong>{state.activeTask.account.desiredUsername}@gmail.com</strong>
            </div>
            <span className={`status ${state.paused ? 'paused' : ''}`}>
              {state.paused ? '已暂停' : state.activeTask.status}
            </span>
            <AccountDetails
              account={state.activeTask.account}
              password={password || '读取中...'}
              onRegenerate={regenerateUsername}
              canRegenerate={!busy && state.activeTask.currentStep === 'USERNAME'}
            />
            <dl className="task-meta">
              <div>
                <dt>步骤</dt>
                <dd>{state.activeTask.currentStep}</dd>
              </div>
              <div>
                <dt>租约到期</dt>
                <dd>{new Date(state.activeTask.leaseExpiresAt).toLocaleTimeString('zh-CN')}</dd>
              </div>
              <div>
                <dt>换名次数</dt>
                <dd>{state.activeTask.usernameRetryCount || 0} / 5</dd>
              </div>
            </dl>
          </section>
          <div className="actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() => act({ type: 'SET_PAUSED', paused: !state.paused })}
            >
              {state.paused ? <IconPlayerPlay size={18} /> : <IconPlayerPause size={18} />}
              {state.paused ? '恢复' : '暂停'}
            </button>
          </div>
          <p className="preview-note">
            用户名更换与注册结果上报由扩展自动完成；CAPTCHA 等安全验证需要人工完成后点击「重新检测页面」继续。
          </p>
        </>
      ) : selectedAccount ? (
        <section className="task account-preview">
          <div className="task-heading">
            <label htmlFor={accounts.length > 1 ? 'account-select' : undefined}>后台账户资料</label>
            {accounts.length > 1 ? (
              <select
                id="account-select"
                value={selectedAccount.id}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.desiredUsername}@gmail.com
                  </option>
                ))}
              </select>
            ) : (
              <strong>{selectedAccount.desiredUsername}@gmail.com</strong>
            )}
          </div>
          <AccountDetails account={selectedAccount} password="领取任务后显示" />
          <p className="preview-note">执行领取任务后，以实际领取的账户资料为准。</p>
        </section>
      ) : (
        <section className="empty">
          <p>{state.identity ? '后台暂无账户资料' : '正在连接后台'}</p>
        </section>
      )}
      <footer>
        <button
          disabled={busy}
          onClick={() =>
            void load().catch((error) =>
              setMessage(error instanceof Error ? error.message : '同步资料失败'),
            )
          }
        >
          <IconRefresh size={15} />
          刷新状态
        </button>
        <span>
          {state.activeTask
            ? `同步于 ${new Date(state.activeTask.lastSyncTime).toLocaleTimeString('zh-CN')}`
            : accounts.length
              ? `后台共 ${accounts.length} 条资料`
              : '等待账户资料'}
        </span>
      </footer>
    </main>
  );
}
