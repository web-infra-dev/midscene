declare module '#yaml-execution-context' {
  export const supportsAsyncContext: boolean;
  export function createExecutionContext<T>(): {
    getStore(): T | undefined;
    run<R>(store: T, callback: () => R): R;
  };
}
