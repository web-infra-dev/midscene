// Browsers retain the existing single-Agent stack behavior. Never bundle Node
// async_hooks into the public Agent/browser entry point.
export const supportsAsyncContext = false;
export const createExecutionContext = <T>() => ({
  getStore: (): T | undefined => undefined,
  run: <R>(_store: T, callback: () => R): R => callback(),
});
