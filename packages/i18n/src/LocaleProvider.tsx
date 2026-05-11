import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { LocaleContext } from './context';
import { lookup } from './lookup';

export interface LocaleProviderProps extends PropsWithChildren {
  dictionaries: Record<string, Record<string, unknown>>;
  storageKey?: string;
  locales?: readonly string[];
  localeLabels?: Record<string, string>;
  defaultLocale?: string;
}

function detectSystemLocale(locales: readonly string[]): string {
  if (typeof navigator === 'undefined') {
    return locales[0];
  }
  const lang = navigator.language?.toLowerCase() ?? '';
  for (const locale of locales) {
    if (lang.startsWith(locale)) {
      return locale;
    }
  }
  return locales[0];
}

function readStoredLocale(
  storageKey: string,
  locales: readonly string[],
  defaultLocale: string,
): string {
  if (typeof window === 'undefined') {
    return defaultLocale;
  }
  const stored = window.localStorage.getItem(storageKey);
  if (locales.includes(stored ?? '')) {
    return stored as string;
  }
  return detectSystemLocale(locales);
}

function writeLocaleAttribute(locale: string) {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : locale;
}

export function LocaleProvider({
  children,
  dictionaries,
  storageKey = 'midscene.locale',
  locales = Object.keys(dictionaries),
  localeLabels = {},
  defaultLocale = locales[0] ?? 'en',
}: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<string>(() =>
    readStoredLocale(storageKey, locales, defaultLocale),
  );

  useEffect(() => {
    window.localStorage.setItem(storageKey, locale);
    writeLocaleAttribute(locale);
  }, [storageKey, locale]);

  const setLocale = useCallback((next: string) => {
    setLocaleState(next);
  }, []);

  const cycleLocale = useCallback(() => {
    setLocaleState((prev) => {
      const index = locales.indexOf(prev);
      return locales[(index + 1) % locales.length];
    });
  }, [locales]);

  const value = useMemo(() => {
    const dict = dictionaries[locale] ?? {};
    return {
      locale,
      setLocale,
      cycleLocale,
      t: (key: string) => lookup(dict, key),
      localeLabel: localeLabels[locale] ?? locale,
    };
  }, [locale, dictionaries, localeLabels, setLocale, cycleLocale]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}
