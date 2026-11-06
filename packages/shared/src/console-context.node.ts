import { AsyncLocalStorage } from 'node:async_hooks';

export const createConsoleContext = <T>() => new AsyncLocalStorage<T>();
