import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type StudioThemeMode = 'light' | 'dark' | 'system';
export type StudioResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'studio.theme-mode';
const VALID_MODES: readonly StudioThemeMode[] = [
  'light',
  'dark',
  'system',
] as const;

interface ThemeContextValue {
  mode: StudioThemeMode;
  resolved: StudioResolvedTheme;
  setMode: (mode: StudioThemeMode) => void;
  cycleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): StudioThemeMode {
  if (typeof window === 'undefined') {
    return 'system';
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return (VALID_MODES as readonly string[]).includes(stored ?? '')
    ? (stored as StudioThemeMode)
    : 'system';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveMode(mode: StudioThemeMode): StudioResolvedTheme {
  if (mode === 'system') {
    return systemPrefersDark() ? 'dark' : 'light';
  }
  return mode;
}

function writeThemeAttribute(resolved: StudioResolvedTheme) {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.dataset.theme = resolved;
}

export function applyStoredThemeMode() {
  writeThemeAttribute(resolveMode(readStoredMode()));
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<StudioThemeMode>(() =>
    readStoredMode(),
  );
  const [resolved, setResolved] = useState<StudioResolvedTheme>(() =>
    resolveMode(readStoredMode()),
  );

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, mode);
    const next = resolveMode(mode);
    setResolved(next);
    writeThemeAttribute(next);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'system' || !window.matchMedia) {
      return;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const next = systemPrefersDark() ? 'dark' : 'light';
      setResolved(next);
      writeThemeAttribute(next);
    };
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [mode]);

  const setMode = useCallback((next: StudioThemeMode) => {
    setModeState(next);
  }, []);

  const cycleMode = useCallback(() => {
    setModeState((prev) => {
      const index = VALID_MODES.indexOf(prev);
      return VALID_MODES[(index + 1) % VALID_MODES.length];
    });
  }, []);

  const value = useMemo(
    () => ({ mode, resolved, setMode, cycleMode }),
    [mode, resolved, setMode, cycleMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useStudioTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useStudioTheme must be used inside ThemeProvider');
  }
  return ctx;
}
