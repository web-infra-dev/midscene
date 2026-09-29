import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, rs } from '@rstest/core';
import siteConfig from '../rspress.config';

rs.mock('../scripts/github-stars', () => ({
  getGitHubStars: async () => '14k+',
}));

const docs = new URL('../docs/', import.meta.url);
const rules = readFileSync(new URL('public/_redirects', docs), 'utf8')
  .split('\n')
  .filter((line) => line.trim() && !line.startsWith('#'))
  .map((line) => {
    const [from, to, status] = line.split(/\s+/);
    return { from, to, status };
  });

describe('legacy HTTP redirects', () => {
  it('uses unique sources and existing targets, including fragment anchors', () => {
    expect(new Set(rules.map(({ from }) => from)).size).toBe(rules.length);
    for (const { from, to, status } of rules) {
      expect(['200', '301']).toContain(status);
      expect(rules.some((rule) => rule.from === to)).toBe(false);
      const [pathname, fragment] = to.split('#');
      if (existsSync(new URL(`public${pathname}`, docs))) {
        continue;
      }
      const localized = pathname.startsWith('/zh/')
        ? pathname.slice(1)
        : `en${pathname}`;
      const target = new URL(
        `${localized.replace(/\.html$/, '')}${pathname.endsWith('/') ? 'index' : ''}.mdx`,
        docs,
      );
      expect(existsSync(target), `${from} -> ${to}`).toBe(true);
      if (fragment) {
        expect(readFileSync(target, 'utf8')).toContain(`{#${fragment}}`);
      }
    }
  });

  it('keeps retired document destinations aligned with Rspress redirects', async () => {
    const config = await (typeof siteConfig === 'function'
      ? siteConfig()
      : siteConfig);
    const plugin = config.plugins?.find(
      (plugin) => plugin.name === '@rspress/plugin-client-redirects',
    );
    const [, options] = plugin?.globalUIComponents?.[0] as unknown as [
      string,
      { redirects: { from: string; to: string }[] },
    ];
    for (const { from, to } of rules.filter(
      ({ from }) => !/\.(png|ico)$/.test(from),
    )) {
      const match = options.redirects.find((rule) =>
        new RegExp(rule.from).test(from),
      );
      expect(match?.to, from).toBe(to);
    }
  });

  it('serves legacy favicon requests as images without redirect loops', () => {
    for (const from of [
      '/favicon.ico',
      '/zh/favicon.ico',
      '/zh/favicon.png',
      '/apple-touch-icon.png',
      '/apple-touch-icon-precomposed.png',
      '/zh/apple-touch-icon.png',
      '/zh/apple-touch-icon-precomposed.png',
    ]) {
      expect(rules.find((rule) => rule.from === from)).toEqual({
        from,
        to: '/favicon.png',
        status: '200',
      });
    }
  });
});
