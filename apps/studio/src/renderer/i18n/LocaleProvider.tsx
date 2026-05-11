import {
  LocaleProvider as BaseLocaleProvider,
  LocaleContext,
  type LocaleContextValue,
  deepMerge,
  lookup,
  makeApplyStoredLocale,
} from '@midscene/i18n';
import { commonEn, commonZh } from '@midscene/i18n/common';
import { type PropsWithChildren, useContext } from 'react';
import studioEn from './locales/en';
import studioZh from './locales/zh';

export type StudioLocale = 'en' | 'zh';

const STORAGE_KEY = 'studio.locale';
const VALID_LOCALES: readonly StudioLocale[] = ['en', 'zh'] as const;
const LOCALE_LABELS: Record<StudioLocale, string> = {
  en: 'English',
  zh: '中文',
};

const dictionaries = {
  en: deepMerge({ common: commonEn }, studioEn) as Record<string, unknown>,
  zh: deepMerge({ common: commonZh }, studioZh) as Record<string, unknown>,
};

const mergedEn = dictionaries.en;

export const applyStoredLocale = makeApplyStoredLocale(
  STORAGE_KEY,
  VALID_LOCALES,
  'en',
);

export function LocaleProvider({ children }: PropsWithChildren) {
  return (
    <BaseLocaleProvider
      dictionaries={dictionaries}
      defaultLocale="en"
      localeLabels={LOCALE_LABELS}
      locales={VALID_LOCALES}
      storageKey={STORAGE_KEY}
    >
      {children}
    </BaseLocaleProvider>
  );
}

function englishLookup(key: string): string {
  try {
    return lookup(mergedEn, key);
  } catch {
    return key;
  }
}

const FALLBACK_LOCALE_VALUE: LocaleContextValue = {
  locale: 'en',
  setLocale: () => undefined,
  cycleLocale: () => undefined,
  t: englishLookup,
  localeLabel: LOCALE_LABELS.en,
};

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext) ?? FALLBACK_LOCALE_VALUE;
}

export function useT(): (key: string) => string {
  return useLocale().t;
}
