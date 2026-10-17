export interface PageAssistantController {
  run(execute?: boolean, force?: boolean): Promise<unknown>;
  stop(): void;
}

export function handlePageAssistantMessage(
  controller: PageAssistantController,
  message: { type?: string },
): Promise<unknown> | undefined {
  if (message.type === 'EXECUTE_PAGE' || message.type === 'REDETECT_PAGE') {
    return controller.run(true, true);
  }
  return undefined;
}

export function createPageAssistant(
  pageKey: () => string,
  assist: (execute: boolean, force: boolean) => Promise<unknown>,
  onError: (error: unknown) => void = () => undefined,
  shouldMarkHandled: (result: unknown) => boolean = Boolean,
): PageAssistantController {
  let timer: number | undefined;
  let interval: number | undefined;
  let pending: Promise<unknown> | undefined;
  const handledKeys = new Set<string>();
  let stopped = false;

  const run = (execute = true, force = false): Promise<unknown> => {
    if (stopped) return Promise.resolve(undefined);
    if (pending) return execute ? pending : pending.then(() => run(false, true));
    const key = pageKey();
    if (!force && execute && handledKeys.has(key)) return Promise.resolve(undefined);
    pending = assist(execute, force)
      .then((result) => {
        if (execute && shouldMarkHandled(result)) {
          if (handledKeys.size >= 100) handledKeys.clear();
          handledKeys.add(key);
        }
        return result;
      })
      .catch((error) => {
        // A failed request needs an explicit retry, not a new request every second.
        if (execute) handledKeys.add(key);
        onError(error);
        return undefined;
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };

  const schedule = () => {
    pageKey();
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void run(), 350);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      'open',
      'hidden',
      'class',
      'style',
      'aria-expanded',
      'aria-disabled',
      'disabled',
    ],
  });
  interval = window.setInterval(() => void run(), 1000);
  void run();

  return {
    run,
    stop() {
      stopped = true;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      observer.disconnect();
    },
  };
}
