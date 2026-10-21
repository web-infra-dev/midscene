// Browser consumers have no CLI output scope and retain normal console output.
export const createConsoleContext = <T>() => ({
  getStore: (): T | undefined => undefined,
  run: <R>(_store: T, callback: () => R): R => callback(),
});
