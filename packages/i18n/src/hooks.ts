import { useContext } from 'react';
import { LocaleContext } from './context';
import type { LocaleContextValue } from './types';

const FALLBACK: LocaleContextValue = {
  locale: 'en',
  setLocale: () => undefined,
  cycleLocale: () => undefined,
  t: (key) => key,
  localeLabel: 'English',
};

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext) ?? FALLBACK;
}

export function useT(): (key: string) => string {
  return useLocale().t;
}
