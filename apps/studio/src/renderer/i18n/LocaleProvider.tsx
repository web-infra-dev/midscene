import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import en from './locales/en';
import zh from './locales/zh';

export type StudioLocale = 'en' | 'zh';

const STORAGE_KEY = 'studio.locale';
const VALID_LOCALES: readonly StudioLocale[] = ['en', 'zh'] as const;

const DICTIONARIES = { en, zh } as const;

const LOCALE_LABELS: Record<StudioLocale, string> = {
  en: 'English',
  zh: '中文',
};

type Dictionary = typeof en;

type DotPath<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends Record<string, unknown>
      ? DotPath<T[K], `${P}${K}.`>
      : never;
}[keyof T & string];

export type TranslationKey = DotPath<Dictionary>;

interface LocaleContextValue {
  locale: StudioLocale;
  setLocale: (locale: StudioLocale) => void;
  cycleLocale: () => void;
  t: (key: TranslationKey) => string;
  localeLabel: string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function detectSystemLocale(): StudioLocale {
  if (typeof navigator === 'undefined') {
    return 'en';
  }
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function readStoredLocale(): StudioLocale {
  if (typeof window === 'undefined') {
    return 'en';
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if ((VALID_LOCALES as readonly string[]).includes(stored ?? '')) {
    return stored as StudioLocale;
  }
  return detectSystemLocale();
}

function writeLocaleAttribute(locale: StudioLocale) {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
}

export function applyStoredLocale() {
  writeLocaleAttribute(readStoredLocale());
}

function lookup(dict: Dictionary, key: string): string {
  const segments = key.split('.');
  let cursor: unknown = dict;
  for (const segment of segments) {
    if (cursor && typeof cursor === 'object' && segment in (cursor as object)) {
      cursor = (cursor as Record<string, unknown>)[segment];
    } else {
      throw new Error(`Missing translation key: ${key}`);
    }
  }
  if (typeof cursor !== 'string') {
    throw new Error(`Translation key is not a string: ${key}`);
  }
  return cursor;
}

export function LocaleProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<StudioLocale>(() =>
    readStoredLocale(),
  );

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    writeLocaleAttribute(locale);
  }, [locale]);

  const setLocale = useCallback((next: StudioLocale) => {
    setLocaleState(next);
  }, []);

  const cycleLocale = useCallback(() => {
    setLocaleState((prev) => {
      const index = VALID_LOCALES.indexOf(prev);
      return VALID_LOCALES[(index + 1) % VALID_LOCALES.length];
    });
  }, []);

  const value = useMemo<LocaleContextValue>(() => {
    const dict = DICTIONARIES[locale];
    return {
      locale,
      setLocale,
      cycleLocale,
      t: (key) => lookup(dict, key),
      localeLabel: LOCALE_LABELS[locale],
    };
  }, [locale, setLocale, cycleLocale]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

const FALLBACK_LOCALE_VALUE: LocaleContextValue = {
  locale: 'en',
  setLocale: () => undefined,
  cycleLocale: () => undefined,
  t: (key) => lookup(en, key),
  localeLabel: LOCALE_LABELS.en,
};

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext) ?? FALLBACK_LOCALE_VALUE;
}

export function useT(): LocaleContextValue['t'] {
  return useLocale().t;
}
