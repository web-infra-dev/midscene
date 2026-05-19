export const DEFAULT_BROWSER_ARGS = [
  '--no-sandbox',
  '--ignore-certificate-errors',
];

export const DEFAULT_VIEWPORT = { width: 1920, height: 1080 } as const;

export function createDefaultsStore<T>() {
  let defaults: T = {} as T;
  return {
    get: (): T => defaults,
    define: (next: T): void => {
      defaults = { ...defaults, ...next };
    },
  };
}
