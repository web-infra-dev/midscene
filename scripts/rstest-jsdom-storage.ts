/**
 * rstest's jsdom environment exposes `window.localStorage` / `sessionStorage`
 * as plain `{}` objects rather than functional `Storage` instances, so calls
 * like `localStorage.clear()` / `setItem()` throw "is not a function". Install
 * a minimal in-memory `Storage` polyfill for jsdom test runs.
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

function ensureStorage(name: 'localStorage' | 'sessionStorage'): void {
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
ensureStorage('sessionStorage');
