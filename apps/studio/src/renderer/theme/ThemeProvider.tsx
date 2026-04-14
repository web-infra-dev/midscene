import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type StudioThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'studio.theme-mode';

interface ThemeContextValue {
  mode: StudioThemeMode;
  setMode: (mode: StudioThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): StudioThemeMode {
  if (typeof window === 'undefined') {
    return 'light';
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'dark' ? 'dark' : 'light';
}

function applyMode(mode: StudioThemeMode) {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.classList.toggle('dark', mode === 'dark');
}

export function applyStoredThemeMode() {
  applyMode(readStoredMode());
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<StudioThemeMode>(() =>
    readStoredMode(),
  );

  useEffect(() => {
    applyMode(mode);
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const setMode = useCallback((next: StudioThemeMode) => {
    setModeState(next);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(
    () => ({ mode, setMode, toggleMode }),
    [mode, setMode, toggleMode],
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
