import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NativeLanguageMenu } from './NativeLanguageMenu';
import { replaceLanguageInPath } from './languagePath';

describe('native language switcher', () => {
  it('renders links that work without React hydration', () => {
    const html = renderToStaticMarkup(
      <NativeLanguageMenu
        activeLabel="English"
        items={[
          { label: 'English', lang: 'en' },
          { href: '/zh/index.html', label: '简体中文', lang: 'zh' },
        ]}
      />,
    );

    expect(html).toMatch(/^<div[^>]+site-language-menu/);
    expect(html).toMatch(/<summary[^>]+>.*English/s);
    expect(html).toMatch(/<\/details><ul class="site-language-menu__list/);
    expect(html).toContain('<a href="/zh/index.html"');
    expect(html).not.toContain('aria-label="Language"');
    expect(html).not.toContain('rp-link');
  });

  it('fully removes Rspress mobile locale controls from layout and keyboard navigation', () => {
    const css = readFileSync(
      new URL('./native-language-switcher.css', import.meta.url),
      'utf8',
    );

    expect(css).toMatch(
      /\.rp-nav-screen-langs-group\s*\{[\s\S]*?display:\s*none\s*!important/,
    );
  });

  it('opens native and Rspress navigation menus on hover or keyboard focus before hydration', () => {
    const css = readFileSync(
      new URL('./native-language-switcher.css', import.meta.url),
      'utf8',
    );

    expect(css).toMatch(/\.site-language-menu:is\(:hover, :focus-within\)/);
    expect(css).toMatch(
      /\.site-language-menu__details\[open\] \+ \.site-language-menu__list/,
    );
    expect(css).toMatch(/\.rp-nav-menu__item:is\(:hover, :focus-within\)/);
    expect(css).toMatch(/\.rp-nav-hamburger__md:is\(:hover, :focus-within\)/);
    expect(css).toMatch(
      /\.rp-nav-hamburger__sm\s*\{[\s\S]*?display:\s*none\s*!important/,
    );
    expect(css).toMatch(/\.site-mobile-nav\s*\{[\s\S]*?display:\s*block/);
  });

  it('builds equivalent language paths for home, docs, query strings, and 404 pages', () => {
    const version = { current: '', default: '' };

    expect(
      replaceLanguageInPath(
        '/',
        { current: 'en', target: 'zh', default: 'en' },
        version,
        false,
        false,
      ),
    ).toBe('/zh/index.html');
    expect(
      replaceLanguageInPath(
        '/guide/start.html?from=nav',
        { current: 'en', target: 'zh', default: 'en' },
        version,
        false,
        false,
      ),
    ).toBe('/zh/guide/start.html?from=nav');
    expect(
      replaceLanguageInPath(
        '/zh/guide/start.html',
        { current: 'zh', target: 'en', default: 'en' },
        version,
        false,
        false,
      ),
    ).toBe('/guide/start.html');
    expect(
      replaceLanguageInPath(
        '/missing',
        { current: 'en', target: 'zh', default: 'en' },
        version,
        true,
        true,
      ),
    ).toBe('/zh/index');
  });

  it('preserves a non-default version and base prefix while switching language', () => {
    expect(
      replaceLanguageInPath(
        '/docs/v2/guide/start.html',
        { current: 'en', target: 'zh', default: 'en' },
        { current: 'v2', default: 'v1' },
        false,
        false,
        '/docs/',
      ),
    ).toBe('/v2/zh/guide/start.html');
  });
});
