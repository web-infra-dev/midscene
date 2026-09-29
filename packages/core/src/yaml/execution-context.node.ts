import { AsyncLocalStorage } from 'node:async_hooks';

export const supportsAsyncContext = true;
export const createExecutionContext = <T>() => new AsyncLocalStorage<T>();
