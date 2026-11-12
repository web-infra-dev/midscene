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
    'pairs each default example with its skipped version in %s',
    async (language) => {
      const html = await handleRequest(
        new Request(`https://badge.example/?lang=${language}`),
      ).text();
      expect(html).toContain(language === 'zh' ? '默认版' : 'Default');
      expect(html).toContain(language === 'zh' ? '带 skipped' : 'With skipped');
      const paths = [...html.matchAll(/<img src="(\/e2e\?[^"]+)"/g)].map(
        ([, path]) =>
          new URL(path.replaceAll('&amp;', '&'), 'https://badge.example'),
      );
      expect(paths).toHaveLength(12);
      for (let index = 0; index < paths.length; index += 2) {
        const defaultUrl = paths[index];
        const skippedUrl = paths[index + 1];
        expect(defaultUrl.searchParams.has('skipped')).toBe(false);
        expect(skippedUrl.searchParams.get('skipped')).toBe('5');
        expect(await handleRequest(new Request(skippedUrl)).text()).toContain(
          '>5 skipped</text>',
        );
        skippedUrl.searchParams.delete('skipped');
        expect([...skippedUrl.searchParams].sort()).toEqual(
          [...defaultUrl.searchParams].sort(),
        );
      }
    },
  );
});
