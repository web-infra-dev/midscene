export function createConsoleContext<T>(): {
  getStore(): T | undefined;
  run<R>(store: T, callback: () => R): R;
};
