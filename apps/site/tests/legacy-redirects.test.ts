import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from '@rstest/core';
import { parseLegacyDocumentRedirects } from '../scripts/legacy-redirects';

const docs = new URL('../docs/', import.meta.url);
const redirectsFile = readFileSync(new URL('public/_redirects', docs), 'utf8');
const rules = redirectsFile
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

  it('derives exact client routes from every HTTP document redirect', () => {
    const documentRules = rules.filter(
      ({ from, status }) => status === '301' && !/\.(png|ico)$/.test(from),
    );
    const clientRules = parseLegacyDocumentRedirects(redirectsFile);
    expect(clientRules).toHaveLength(documentRules.length);
    for (const [{ from, to }, clientRule] of documentRules.map(
      (rule, index) => [rule, clientRules[index]] as const,
    )) {
      expect(clientRule.to, from).toBe(to);
      expect(new RegExp(clientRule.from).test(from), from).toBe(true);
      expect(new RegExp(clientRule.from).test(`${from}unexpected`), from).toBe(
        false,
      );
    }
  });

  it('keeps language and URL variants for retired documents complete', () => {
    const documentRules = rules.filter(
      ({ from, status }) => status === '301' && !/\.(png|ico)$/.test(from),
    );
    const bySource = new Map(documentRules.map(({ from, to }) => [from, to]));
    for (const { from, to } of documentRules) {
      const englishSource = from.replace(/^\/zh\//, '/');
      const baseSource = englishSource.replace(/(?:\.html)?\/?$/, '');
      const englishTarget = to.replace(/^\/zh\//, '/');
      for (const locale of ['', '/zh']) {
        for (const suffix of ['', '.html', '.html/', '/']) {
          const variant = `${locale}${baseSource}${suffix}`;
          expect(bySource.get(variant), `${from} needs ${variant}`).toBe(
            `${locale}${englishTarget}`,
          );
        }
      }
    }
    for (const source of [
      '/ios-api-reference.html',
      '/integrate-with-ios',
      '/test-runner-overview',
      '/zh/reference/harmonyos/',
    ]) {
      expect(bySource.has(source), source).toBe(true);
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
