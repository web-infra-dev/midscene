import { useLang } from '@rspress/core/runtime';
import { useCallback } from 'react';
import { EN_US } from './enUS';
import { ZH_CN } from './zhCN';

const translations = {
  en: EN_US,
  zh: ZH_CN,
} as const;

export function useI18nUrl() {
  const lang = useLang();

  const tUrl = useCallback(
    (url: string) => {
      return lang === 'en' ? url : `/${lang}${url}`;
    },
    [lang],
  );

  return tUrl;
}

export function useI18n() {
  const lang = useLang() as keyof typeof translations;
  return (key: keyof typeof EN_US) => translations[lang][key];
}
