import { addLeadingSlash, normalizeHref, removeBase } from '@rspress/shared';

export interface LanguageRouteState {
  current: string;
  target: string;
  default: string;
}

export interface VersionRouteState {
  current: string;
  default: string;
}

export function replaceLanguageInPath(
  rawUrl: string,
  language: LanguageRouteState,
  version: VersionRouteState,
  cleanUrls: boolean,
  isPageNotFound: boolean,
  base = '/',
): string {
  let url = removeBase(rawUrl, base);
  if (!url || isPageNotFound) url = '/';
  url = normalizeHref(url, cleanUrls);

  const parts = url.split('/').filter(Boolean);
  let versionPart = '';
  let languagePart = '';

  if (version.current && version.current !== version.default) {
    versionPart = parts.shift() || '';
  }

  if (language.target !== language.default) {
    languagePart = language.target;
    if (language.current !== language.default) parts.shift();
  } else {
    parts.shift();
  }

  let pagePath = parts.join('/') || '';
  if ((versionPart || languagePart) && !pagePath) {
    pagePath = cleanUrls ? 'index' : 'index.html';
  }

  return addLeadingSlash(
    [versionPart, languagePart, pagePath].filter(Boolean).join('/'),
  );
}
