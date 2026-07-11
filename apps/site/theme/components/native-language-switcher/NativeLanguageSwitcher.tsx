import {
  useLocation,
  usePage,
  useSite,
  useVersion,
  withBase,
} from '@rspress/core/runtime';
import { NativeLanguageMenu } from './NativeLanguageMenu';
import { replaceLanguageInPath } from './languagePath';
import './native-language-switcher.css';

export function NativeLanguageSwitcher() {
  const { page } = usePage();
  const { site } = useSite();
  const version = useVersion();
  const { pathname, search } = useLocation();
  const languages = Object.values(
    site.locales || site.themeConfig.locales || {},
  );

  if (languages.length < 2) return null;

  const currentLanguage = page.lang;
  const defaultLanguage = site.lang || '';
  const defaultVersion = site.multiVersion.default || '';
  const cleanUrls = site.route?.cleanUrls || false;
  const activeLabel =
    languages.find((language) => language.lang === currentLanguage)?.label ||
    currentLanguage;
  const items = languages.map((language) => {
    const isCurrent = language.lang === currentLanguage;
    const path = isCurrent
      ? undefined
      : replaceLanguageInPath(
          pathname + search,
          {
            current: currentLanguage,
            target: language.lang,
            default: defaultLanguage,
          },
          {
            current: version,
            default: defaultVersion,
          },
          cleanUrls,
          page.pageType === '404',
          site.base,
        );

    return {
      href: path ? withBase(path) : undefined,
      label: language.label,
      lang: language.lang,
    };
  });

  return <NativeLanguageMenu activeLabel={activeLabel} items={items} />;
}
