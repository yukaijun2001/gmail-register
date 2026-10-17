import { browser } from 'wxt/browser';
import { createPageAssistant, handlePageAssistantMessage } from '../src/shared/page-assistant';
import {
  runWorkspaceAssistant,
  workspacePageKey,
} from '../src/features/google-workspace/run-workspace-assistant';

export default defineContentScript({
  matches: ['https://workspace.google.com/intl/*/gmail/*', 'https://workspace.google.com/gmail/*'],
  runAt: 'document_idle',
  main(ctx) {
    const controller = createPageAssistant(
      workspacePageKey,
      (execute) => runWorkspaceAssistant(execute),
      (error) =>
        void browser.runtime
          .sendMessage({ type: 'ASSISTANT_ERROR', message: String(error) })
          .catch(() => undefined),
    );
    ctx.onInvalidated(controller.stop);
    const onMessage = (message: any) => handlePageAssistantMessage(controller, message);
    browser.runtime.onMessage.addListener(onMessage);
    ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(onMessage));
  },
});
