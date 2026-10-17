import { startWorkerRuntime } from '../src/features/worker/runtime';

export default defineBackground(() => {
  startWorkerRuntime();
});
