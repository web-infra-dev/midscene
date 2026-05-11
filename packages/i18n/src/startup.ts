export function makeApplyStoredLocale(
  storageKey: string,
  locales: readonly string[],
  defaultLocale: string,
): () => void {
  return () => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem(storageKey);
    const locale = locales.includes(stored ?? '')
      ? (stored as string)
      : defaultLocale;
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale === 'zh' ? 'zh-CN' : locale;
    }
  };
}
