import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NativeMobileMenu } from './NativeMobileMenu';

describe('native mobile navigation', () => {
  it('renders native links and nested groups that work without hydration', () => {
    const html = renderToStaticMarkup(
      <NativeMobileMenu
        resolveHref={(href) =>
          href.startsWith('http') ? href : `/docs${href}`
        }
        items={[
          { text: 'Guide', link: '/guide', lang: 'en', rel: 'help' },
          {
            text: 'Versions',
            link: '/versions',
            items: [
              { text: 'Current', link: '/current', download: true },
              { text: 'Legacy', link: 'https://legacy.example.com' },
            ],
          },
        ]}
      />,
    );

    expect(html).toMatch(/^<details class="site-mobile-nav">/);
    expect(html).toMatch(/<nav[^>]+aria-label="Mobile navigation"/);
    expect(html).toMatch(
      /<a class="site-mobile-nav__item" href="\/docs\/guide" hrefLang="en" lang="en" rel="help">Guide<\/a>/,
    );
    expect(html).toMatch(/<summary[^>]*>Versions/);
    expect(html).toContain('href="/docs/versions"');
    expect(html).toContain('href="/docs/current" download=""');
    expect(html).toContain('href="https://legacy.example.com"');
    expect(html).not.toMatch(/onClick|rp-link/);
  });

  it('does not render an empty mobile navigation control', () => {
    expect(renderToStaticMarkup(<NativeMobileMenu items={[]} />)).toBe('');
  });

  it('sizes the panel from below the filtered nav to the dynamic viewport', () => {
    const css = readFileSync(
      new URL('./native-language-switcher.css', import.meta.url),
      'utf8',
    );

    expect(css).toMatch(
      /\.site-mobile-nav__panel\s*\{[\s\S]*?position:\s*absolute/,
    );
    expect(css).toMatch(/\.site-mobile-nav__panel\s*\{[\s\S]*?top:\s*100%/);
    expect(css).toMatch(
      /height:\s*calc\(100dvh - var\(--rp-nav-height\) - var\(--rp-banner-height, 0px\)\)/,
    );
    expect(css).not.toMatch(
      /\.site-mobile-nav__panel\s*\{[\s\S]*?position:\s*fixed/,
    );
  });
});
