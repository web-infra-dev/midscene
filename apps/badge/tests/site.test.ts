import { describe, expect, it } from '@rstest/core';
import { handleRequest } from '../src/badge';

const get = (path: string, method = 'GET') =>
  handleRequest(new Request(`https://badge.example${path}`, { method }));

describe('site discovery', () => {
  it('serves a square, self-contained favicon and redirects the conventional ico path', async () => {
    const response = get('/favicon.svg');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');
    const svg = await response.text();
    expect(svg).toContain('viewBox="0 0 96 96"');
    expect(svg).toContain('href="data:image/png;base64,');
    expect(get('/favicon.ico').status).toBe(308);
    expect(get('/favicon.ico').headers.get('Location')).toBe('/favicon.svg');
  });

  it('publishes a sitemap containing only stable language pages', async () => {
    expect(await get('/robots.txt').text()).toContain(
      'Sitemap: https://badge.midscenejs.com/sitemap.xml',
    );
    const response = get('/sitemap.xml');
    expect(response.headers.get('Content-Type')).toBe(
      'application/xml; charset=utf-8',
    );
    const xml = await response.text();
    expect(xml.match(/<url>/g)).toHaveLength(2);
    for (const lang of ['en', 'zh'])
      expect(xml).toContain(
        `<loc>https://badge.midscenejs.com/?lang=${lang}</loc>`,
      );
    expect(xml).not.toContain('/e2e');
  });

  it.each(['/favicon.svg', '/robots.txt', '/sitemap.xml'])(
    'supports HEAD and rejects POST for %s',
    async (path) => {
      const head = get(path, 'HEAD');
      expect(head.status).toBe(200);
      expect(await head.text()).toBe('');
      expect(head.headers.get('Content-Type')).toBe(
        get(path).headers.get('Content-Type'),
      );
      expect(get(path, 'POST').status).toBe(405);
    },
  );

  it.each(['en', 'zh'])(
    'includes localized metadata and reciprocal alternate links for %s',
    async (lang) => {
      const html = await get(`/?lang=${lang}&utm_source=test`).text();
      expect(html).toContain('<title>Midscene Test Badge —');
      expect(html).toContain(
        '<link rel="icon" type="image/svg+xml" href="/favicon.svg">',
      );
      expect(html).toContain(
        `<link rel="canonical" href="https://badge.midscenejs.com/?lang=${lang}">`,
      );
      for (const alternate of ['en', 'zh'])
        expect(html).toContain(
          `<link rel="alternate" hreflang="${alternate}" href="https://badge.midscenejs.com/?lang=${alternate}">`,
        );
      expect(html).toContain('hreflang="x-default"');
      expect(html).toContain('name="description"');
      expect(html).toContain('property="og:title"');
      expect(html).toContain('name="twitter:card"');
      expect(html).not.toContain('utm_source');
    },
  );
});
