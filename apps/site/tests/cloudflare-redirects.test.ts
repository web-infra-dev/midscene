import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@rstest/core';

const { rules } = JSON.parse(
  readFileSync(
    new URL('../cloudflare/redirects.json', import.meta.url),
    'utf8',
  ),
) as {
  rules: {
    expression: string;
    action_parameters: {
      from_value: {
        target_url: { expression: string };
        status_code: number;
        preserve_query_string: boolean;
      };
    };
  }[];
};

// Evaluate the limited Cloudflare expression subset used by this config, so
// cases exercise the actual configured predicates, targets, and rule ordering.
function evaluate(expression: string, url: URL, country: string) {
  const translated = expression
    .replace(/http\.request\.uri\.path/g, 'path')
    .replace(/http\.host/g, 'host')
    .replace(/ip\.src\.country/g, 'country')
    .replace(
      /path in \{([^}]+)\}/g,
      (_, values) => `[${values.trim().split(/\s+/).join(',')}].includes(path)`,
    )
    .replace(/\beq\b/g, '===')
    .replace(/\band\b/g, '&&')
    .replace(/\bor\b/g, '||')
    .replace(/\bnot\b/g, '!');
  return new Function(
    'path',
    'host',
    'country',
    'starts_with',
    'concat',
    `return (${translated});`,
  )(
    url.pathname,
    url.hostname,
    country,
    (value: string, prefix: string) => value.startsWith(prefix),
    (...values: string[]) => values.join(''),
  );
}

function redirect(source: string, country: string) {
  const url = new URL(source);
  const rule = rules.find((item) => evaluate(item.expression, url, country));
  if (!rule) return undefined;
  const value = rule.action_parameters.from_value;
  return {
    status: value.status_code,
    location:
      evaluate(value.target_url.expression, url, country) +
      (value.preserve_query_string ? url.search : ''),
  };
}

describe('Cloudflare apex redirects', () => {
  it('combines HTTPS, www and Chinese localization in one permanent redirect', () => {
    for (const scheme of ['http', 'https']) {
      for (const [path, target] of [
        ['/', '/zh/'],
        [
          '/get-started?scene=cli&platform=web',
          '/zh/get-started?scene=cli&platform=web',
        ],
        ['/sdk/playwright', '/zh/sdk/playwright'],
        ['/zh', '/zh/'],
        ['/zh/', '/zh/'],
        ['/zh/sdk/playwright?q=%E4%B8%AD', '/zh/sdk/playwright?q=%E4%B8%AD'],
        ['/zhang', '/zh/zhang'],
      ]) {
        expect(redirect(`${scheme}://midscenejs.com${path}`, 'CN')).toEqual({
          status: 301,
          location: `https://www.midscenejs.com${target}`,
        });
      }
    }
  });

  it('preserves paths and queries outside China, including missing geolocation', () => {
    for (const country of ['US', 'GB', 'HK', 'TW', '']) {
      for (const path of ['/', '/sdk/web?x=1', '/zh/sdk/ios']) {
        expect(redirect(`http://midscenejs.com${path}`, country)).toEqual({
          status: 301,
          location: `https://www.midscenejs.com${path}`,
        });
      }
    }
  });

  it('keeps shared assets and metadata at the public root in China', () => {
    for (const path of [
      '/images/brand/logo.png',
      '/static/main.js',
      '/favicon.ico',
      '/favicon.png',
      '/og-image.png',
      '/robots.txt',
      '/sitemap.xml',
      '/sitemap-index.xml',
      '/apple-touch-icon.png',
      '/apple-touch-icon-precomposed.png',
    ]) {
      expect(redirect(`https://midscenejs.com${path}?v=1`, 'CN')).toEqual({
        status: 301,
        location: `https://www.midscenejs.com${path}?v=1`,
      });
    }
  });

  it('never redirects www, previews, badge or other hosts', () => {
    for (const host of [
      'www.midscenejs.com',
      'badge.midscenejs.com',
      'midscene.pages.dev',
    ]) {
      expect(redirect(`https://${host}/`, 'CN')).toBeUndefined();
    }
  });
});
