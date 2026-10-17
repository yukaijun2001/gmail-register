export function isWorkspaceGmailUrl(value?: string): boolean {
  try {
    const url = new URL(value || '');
    return (
      url.origin === 'https://workspace.google.com' &&
      /^\/(?:intl\/[^/]+\/)?gmail(?:\/|$)/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function isSignupUrl(value?: string): boolean {
  try {
    const url = new URL(value || '');
    return (
      url.origin === 'https://accounts.google.com' &&
      /\/(signup|createaccount)(\/|$)/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}
