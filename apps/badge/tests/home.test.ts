import { describe, expect, it } from '@rstest/core';
import { handleRequest } from '../src/badge';
import { homeLanguage } from '../src/home';

describe('homepage language and navigation', () => {
  it.each([
    ['', {}, 'en'],
    ['', { 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' }, 'zh'],
    ['', { 'Accept-Language': 'zh;q=0.5,en;q=0.9' }, 'en'],
    ['', { 'Accept-Language': 'zh;q=0,en;q=1' }, 'en'],
    ['', { 'User-Agent': 'Mozilla/5.0 (zh-CN)' }, 'zh'],
    ['?lang=en', { 'Accept-Language': 'zh-CN' }, 'en'],
    ['?lang=zh', { 'Accept-Language': 'en-US' }, 'zh'],
    ['?lang=invalid', { 'Accept-Language': 'zh-TW' }, 'zh'],
  ] as const)('resolves %s with %j to %s', (query, headers, expected) => {
    expect(
      homeLanguage(new Request(`https://badge.example/${query}`, { headers })),
    ).toBe(expected);
  });

  it.each(['zh', 'en'])(
    'renders a separate %s page with previews first',
    async (language) => {
      const response = handleRequest(
        new Request(`https://badge.example/?lang=${language}`),
      );
      const html = await response.text();
      expect(html).toContain(`lang="${language === 'zh' ? 'zh-CN' : 'en'}"`);
      expect(html).toContain(
        `href="/?lang=${language}" lang="${language === 'zh' ? 'zh-CN' : 'en'}" aria-current="page"`,
      );
      expect(html.indexOf('id="previews"')).toBeLessThan(
        html.indexOf('id="parameters"'),
      );
      expect(html).toContain(
        language === 'zh'
          ? '用 Badge 在 Markdown 中展示 E2E 测试结果'
          : 'Show E2E test results with a Markdown badge',
      );
      expect(html).not.toContain(
        language === 'zh' ? 'Counts come from the URL' : '数字由 URL 提供',
      );
      expect(html).toContain(
        '<a href="https://midscenejs.com">Midscene.js</a>',
      );
      expect(html).toContain('<img class="logo" src="data:image/png;base64,');
      expect(response.headers.get('Vary')).toBe('Accept-Language, User-Agent');
    },
  );
});

describe('homepage skipped examples', () => {
  it.each(['zh', 'en'])(
    'separates examples with and without skipped in %s',
    async (language) => {
      const html = await handleRequest(
        new Request(`https://badge.example/?lang=${language}`),
      ).text();
      const without = html
        .split('id="without-skipped"')[1]
        .split('aria-labelledby="with-skipped"')[0];
      const withSkipped = html
        .split('id="with-skipped"')[1]
        .split('aria-labelledby="static-badges"')[0];
      expect(without).toContain(
        language === 'zh' ? '不含 skipped' : 'Without skipped',
      );
      expect(withSkipped).toContain(
        language === 'zh' ? '含 skipped' : 'With skipped',
      );
      const paths = (group: string) =>
        [...group.matchAll(/<img src="([^"]+)"/g)].map(([, path]) =>
          path.replaceAll('&amp;', '&'),
        );
      const withoutPaths = paths(without);
      const withPaths = paths(withSkipped);
      expect(withoutPaths).toHaveLength(6);
      expect(withPaths).toHaveLength(5);
      for (const path of withoutPaths) {
        expect(
          new URL(path, 'https://badge.example').searchParams.has('skipped'),
        ).toBe(false);
      }
      for (const [index, path] of withPaths.entries()) {
        const url = new URL(path, 'https://badge.example');
        expect(url.searchParams.get('skipped')).toBe('5');
        expect(await handleRequest(new Request(url)).text()).toContain(
          '>5 skipped</text>',
        );
        if (index < 4) {
          url.searchParams.delete('skipped');
          expect(`${url.pathname}${url.search}`).toBe(withoutPaths[index]);
        }
      }
    },
  );
});
