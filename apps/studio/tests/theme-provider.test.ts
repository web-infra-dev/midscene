import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadModule() {
  vi.resetModules();
  return import('../src/renderer/theme/ThemeProvider');
}

function setMatchMedia(initial: boolean) {
  const listeners = new Set<(ev: MediaQueryListEvent) => void>();
  const media = {
    matches: initial,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, cb: (ev: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    },
    removeEventListener: (_: string, cb: (ev: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
    },
    dispatchEvent: () => false,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
  } as unknown as MediaQueryList;
  window.matchMedia = vi.fn().mockReturnValue(media);
  return {
    flip(next: boolean) {
      (media as { matches: boolean }).matches = next;
      for (const cb of listeners) {
        cb({ matches: next } as MediaQueryListEvent);
      }
    },
  };
}

describe('applyStoredThemeMode', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    setMatchMedia(false);
  });

  it('falls back to system when storage is empty and OS is light', async () => {
    const { applyStoredThemeMode } = await loadModule();
    applyStoredThemeMode();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('falls back to system when storage has an unexpected value', async () => {
    window.localStorage.setItem('studio.theme-mode', 'rainbow');
    const { applyStoredThemeMode } = await loadModule();
    applyStoredThemeMode();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('resolves dark when OS prefers dark under system mode', async () => {
    setMatchMedia(true);
    const { applyStoredThemeMode } = await loadModule();
    applyStoredThemeMode();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('honours a stored explicit dark mode regardless of OS preference', async () => {
    setMatchMedia(false);
    window.localStorage.setItem('studio.theme-mode', 'dark');
    const { applyStoredThemeMode } = await loadModule();
    applyStoredThemeMode();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('honours a stored explicit light mode when the OS prefers dark', async () => {
    setMatchMedia(true);
    window.localStorage.setItem('studio.theme-mode', 'light');
    const { applyStoredThemeMode } = await loadModule();
    applyStoredThemeMode();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
