import { LOGO_96 } from './logo';

export const BADGE_ORIGIN = 'https://badge.midscenejs.com';

/** Public discovery endpoints; independent of badge result parameters. */
export function siteResponse(request: Request): Response | undefined {
  const path = new URL(request.url).pathname;
  if (path === '/favicon.ico') {
    return new Response(null, {
      status: 308,
      headers: {
        Location: '/favicon.svg',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }
  let body: string;
  let contentType: string;
  if (path === '/favicon.svg') {
    body = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><image href="${LOGO_96}" x="0" y="2.5" width="96" height="91"/></svg>`;
    contentType = 'image/svg+xml';
  } else if (path === '/robots.txt') {
    body = `User-agent: *\nAllow: /\nSitemap: ${BADGE_ORIGIN}/sitemap.xml\n`;
    contentType = 'text/plain; charset=utf-8';
  } else if (path === '/sitemap.xml') {
    body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['en', 'zh'].map((lang) => `<url><loc>${BADGE_ORIGIN}/?lang=${lang}</loc></url>`).join('')}</urlset>`;
    contentType = 'application/xml; charset=utf-8';
  } else return undefined;
  return new Response(request.method === 'HEAD' ? null : body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control':
        path === '/favicon.svg'
          ? 'public, max-age=86400'
          : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
