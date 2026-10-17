import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Gmail 注册辅助 Worker',
    description: '经授权的个人 Gmail 注册自动化工具',
    version: '0.1.0',
    permissions: ['storage', 'tabs', 'alarms'],
    host_permissions: ['http://*/*', 'https://*/*', 'https://accounts.google.com/*'],
    action: { default_title: '注册辅助 Worker' },
  },
});
