import {
  isRegistrationResultHandled,
  runRegistrationAssistant,
} from '../src/features/google-signup/run-registration-assistant';
import { detectStep } from '../src/features/google-signup/detector';
import { browser } from 'wxt/browser';
import { readVisibleError } from '../src/features/google-signup/error-parser';
import { createPageAssistant, handlePageAssistantMessage } from '../src/shared/page-assistant';

export default defineContentScript({
  matches: ['https://accounts.google.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    let lastError = '';
    let errorVersion = 0;
    const pageKey = () => {
      const detection = detectStep();
      const error = readVisibleError() || '';
      if (error && error !== lastError) errorVersion++;
      lastError = error;
      return `${location.href}:${detection?.step || 'UNKNOWN'}:${error ? `error-${errorVersion}` : 'ready'}`;
    };
    const controller = createPageAssistant(
      pageKey,
      (execute, force) => runRegistrationAssistant(execute, force),
      (error) =>
        void browser.runtime
          .sendMessage({ type: 'ASSISTANT_ERROR', message: String(error) })
          .catch(() => undefined),
      isRegistrationResultHandled,
    );
    ctx.onInvalidated(controller.stop);

    const onMessage = (message: any) => handlePageAssistantMessage(controller, message);
    browser.runtime.onMessage.addListener(onMessage);
    ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(onMessage));
  },
});
