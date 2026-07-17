/**
 * Node >= 25 enables the Web Storage API by default, so `localStorage` exists on
 * `globalThis` before jsdom is set up. Without `--localstorage-file` that global
 * has no methods, and rstest's jsdom `getWindowKeys` skips any key already `in
 * global`, so jsdom's real `Storage` is filtered out and the broken Node stub is
 * what tests see -- `localStorage.setItem()` then throws "is not a function", and
 * each run prints `Warning: --localstorage-file was provided without a valid
 * path`. This is a local-dev artifact only: CI pins Node 24, where the global
 * does not exist and jsdom's real `Storage` is used.
 *
 * The origin is not rstest-specific (vitest 3.0.5 fails identically), but current
 * vitest ports a fix and rstest has not yet -- tracked at web-infra-dev/rstest#1583.
 * Install a minimal in-memory `Storage` polyfill so jsdom test runs work on Node
 * >= 25 too. Only `localStorage` needs it; Node's built-in `sessionStorage` is
 * functional, so it never trips the guard below.
 *
 * Wire this in via `setupFiles` on any jsdom project whose tests touch web
 * storage.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

function ensureStorage(name: 'localStorage'): void {
  const current = (globalThis as { [k: string]: unknown })[name] as
    | Storage
    | undefined;
  if (current && typeof current.clear === 'function') return;

  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, name, {
    value: storage,
    configurable: true,
    writable: true,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, name, {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}

ensureStorage('localStorage');
