import { describe, expect, it } from '@rstest/core';
import {
  BADGE_VERSION,
  edgeCacheKey,
  handleRequest,
  withConditional,
} from '../src/badge';
import { renderHome } from '../src/home';
import { LOGO_96 } from '../src/logo';

const ORIGIN = 'https://badge.example.com';
const request = (query: string, init?: RequestInit) =>
  new Request(`${ORIGIN}/e2e?${query}`, init);
const payloads = [
  '<script>document.title="BADGE_XSS_EXECUTED"</script>',
  '</text><script>alert(1)</script><text>',
  '"><svg onload="alert(1)">',
  "'><img src=x onerror=alert(1)>",
  '<foreignObject><iframe srcdoc="<script>alert(1)</script>"></iframe></foreignObject>',
  'javascript:alert(1)',
  'data:image/svg+xml,<svg onload=alert(1)>',
  '&lt;script&gt;alert(1)&lt;/script&gt;',
  '&#60;svg onload=alert(1)&#62;',
  '%3Cscript%3Ealert(1)%3C%2Fscript%3E',
  '%253Cscript%253Ealert(1)%253C%252Fscript%253E',
  '1\r\nContent-Type: text/html\r\n\r\n<script>alert(1)</script>',
  '1\u0000<script>alert(1)</script>',
  '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>',
  'http://169.254.169.254/latest/meta-data/',
  '../../etc/passwd',
  '${7*7}',
  '{{7*7}}',
  '__proto__',
  'constructor',
];

const injections = ['pass', 'fail', 'style', 'theme'].flatMap((field) =>
  payloads.map((payload, index) => ({ field, payload, index })),
);

describe('URL injection boundaries', () => {
  it.each(injections)(
    'rejects payload $index in $field without an executable response or cache entry',
    async ({ field, payload }) => {
      const params = new URLSearchParams(
        'pass=42&fail=3&style=card&theme=light',
      );
      params.set(field, payload);
      const req = request(params.toString(), {
        headers: { Accept: 'text/html' },
      });
      const res = handleRequest(req);
      expect(res.status).toBe(400);
      expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(res.headers.has('ETag')).toBe(false);
      expect(res.headers.has('Location')).toBe(false);
      expect(res.headers.has('Set-Cookie')).toBe(false);
      expect(edgeCacheKey(req)).toBeNull();
      expect(await res.text()).toContain('must be');
    },
  );

  it.each([
    '',
    '-1',
    '+1',
    '1.5',
    '1e3',
    '0x10',
    'NaN',
    'Infinity',
    '10000000',
    '9007199254740993',
    '1 2',
    ' 1',
    '1 ',
    '1\n',
    '1\r\n',
    '1\u2028',
    '１',
    '١',
    '1\u0000',
  ])('rejects non-decimal or out-of-range counts: %j', (value) => {
    for (const field of ['pass', 'fail']) {
      const params = new URLSearchParams('pass=1&fail=0');
      params.set(field, value);
      expect(handleRequest(request(params.toString())).status).toBe(400);
    }
  });

  it.each(['%FF', '%C0%AF', '%E0%A4%A', '%', '%00', '%0D%0A'])(
    'rejects malformed encoding %s',
    (value) => {
      expect(handleRequest(request(`pass=${value}&fail=0`)).status).toBe(400);
    },
  );

  it('does not reflect unknown query parameters into a valid badge', async () => {
    const clean = await handleRequest(request('pass=42&fail=3')).text();
    for (const field of ['label', 'logo', 'url', 'callback', '__proto__']) {
      const params = new URLSearchParams('pass=42&fail=3');
      params.set(field, payloads[0]);
      expect(await handleRequest(request(params.toString())).text()).toBe(
        clean,
      );
    }
  });

  it('keeps header injection in the text body and never promotes errors to 304', () => {
    const params = new URLSearchParams({ pass: payloads[11], fail: '0' });
    const req = request(params.toString(), {
      headers: { 'If-None-Match': `"v${BADGE_VERSION}-flat-light-1-0"` },
    });
    const res = withConditional(req, handleRequest(req));
    expect(res.status).toBe(400);
    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.has('Location')).toBe(false);
  });
});

describe('cache and request isolation', () => {
  it.each([
    'pass=42&fail=3',
    'fail=3&pass=00042',
    'pass=%34%32&fail=3',
    'pass=42&fail=3&style=flat&theme=light',
    'pass=42&fail=3&pass=%3Cscript%3E',
    'pass=42&fail=3&style=flat&style=%3Cscript%3E',
    'pass=42&fail=3&theme=light&theme=%3Cscript%3E',
    'pass=42&fail=3&v=attacker&url=http://169.254.169.254/',
  ])(
    'uses the same validated values for output and cache key: %s',
    async (query) => {
      const req = request(query);
      const key = edgeCacheKey(req)!;
      const reference = edgeCacheKey(request('pass=42&fail=3'))!;
      expect(key.url).toBe(reference.url);
      expect(await handleRequest(req).text()).toBe(
        await handleRequest(key).text(),
      );
    },
  );

  it.each(['pass', 'fail', 'style', 'theme'])(
    'rejects an invalid first %s value even when followed by a valid duplicate',
    (field) => {
      const params = new URLSearchParams({ [field]: payloads[0] });
      for (const [key, value] of new URLSearchParams(
        'pass=42&fail=3&style=flat&theme=light',
      )) {
        params.append(key, value);
      }
      const req = request(params.toString());
      expect(handleRequest(req).status).toBe(400);
      expect(edgeCacheKey(req)).toBeNull();
    },
  );

  it('ignores untrusted forwarding and authentication headers', async () => {
    const req = request('pass=42&fail=3', {
      headers: {
        'X-Forwarded-Host': 'attacker.invalid',
        'X-Forwarded-Proto': 'javascript',
        'X-Original-URL': '/?x=<script>alert(1)</script>',
        Origin: 'https://attacker.invalid',
        Cookie: 'session=secret-audit-marker',
        Authorization: 'Bearer secret-audit-marker',
      },
    });
    const res = handleRequest(req);
    const clean = handleRequest(request('pass=42&fail=3'));
    expect(await res.text()).toBe(await clean.text());
    expect([...res.headers]).toEqual([...clean.headers]);
    expect(edgeCacheKey(req)!.url).toBe(
      edgeCacheKey(request('pass=42&fail=3'))!.url,
    );
  });

  it('isolates output-changing parameters and different origins in cache keys', () => {
    const queries = [
      'pass=42&fail=3',
      'pass=43&fail=3',
      'pass=42&fail=4',
      'pass=42&fail=3&style=large',
      'pass=42&fail=3&style=card',
      'pass=42&fail=3&style=card&theme=dark',
    ];
    const keys = queries.map((query) => edgeCacheKey(request(query))!.url);
    expect(new Set(keys).size).toBe(queries.length);
    expect(
      edgeCacheKey(new Request('https://other.invalid/e2e?pass=42&fail=3'))!
        .url,
    ).not.toBe(keys[0]);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'rejects %s without reflecting its body',
    async (method) => {
      const res = handleRequest(
        request('pass=42&fail=3', { method, body: payloads[0] }),
      );
      expect(res.status).toBe(405);
      expect(await res.text()).toBe('Method Not Allowed');
    },
  );
});

describe('HTML and SVG output boundaries', () => {
  it('ignores homepage query strings and forwarded hosts', async () => {
    const req = new Request(
      `${ORIGIN}/?${new URLSearchParams({ q: payloads[0] })}`,
      {
        headers: { 'X-Forwarded-Host': 'attacker.invalid' },
      },
    );
    expect(await handleRequest(req).text()).toBe(
      await handleRequest(new Request(`${ORIGIN}/`)).text(),
    );
  });

  it('HTML-escapes the origin even if renderHome is called outside the request handler', () => {
    const html = renderHome(
      'https://example.invalid/</code><script>alert("x")</script>&\'',
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain(
      '&lt;/code&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;',
    );
    for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      expect(
        url.startsWith('/e2e?') ||
          /^\/by-midscene(?:\?style=large)?$/.test(url) ||
          /^\/\?lang=(zh|en)$/.test(url) ||
          url === 'https://midscenejs.com' ||
          url === '/favicon.svg' ||
          /^https:\/\/badge\.midscenejs\.com\/(?:\?lang=(?:en|zh))?$/.test(
            url,
          ) ||
          url === LOGO_96,
      ).toBe(true);
    }
  });

  it('does not reflect unknown paths', async () => {
    const res = handleRequest(
      new Request(`${ORIGIN}/${encodeURIComponent(payloads[0])}`),
    );
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    expect(await res.text()).not.toContain('BADGE_XSS_EXECUTED');
  });

  it('keeps every style and boundary count free of active content or external image URLs', async () => {
    for (const style of ['flat', 'large', 'card']) {
      for (const theme of ['light', 'dark']) {
        for (const pass of [0, 1, 9999999]) {
          for (const fail of [0, 1, 9999999]) {
            const res = handleRequest(
              request(
                `pass=${pass}&fail=${fail}&style=${style}&theme=${theme}`,
              ),
            );
            expect(res.status).toBe(200);
            const svg = await res.text();
            expect(svg).not.toMatch(
              /<\s*(?:script|foreignObject|iframe|animate|set)\b|\bon[a-z]+\s*=|<!DOCTYPE|<!ENTITY/i,
            );
            const links = [...svg.matchAll(/\bhref="([^"]*)"/g)];
            expect(links).toHaveLength(1);
            expect(links[0][1]).toMatch(
              /^data:image\/png;base64,[A-Za-z0-9+/=]+$/,
            );
            expect(svg).toContain(
              `aria-label="Midscene Test: ${pass} passed, ${fail} failed"`,
            );
            expect(svg.length).toBeLessThan(30000);
          }
        }
      }
    }
  });

  it('normalizes long zero-prefixed counts instead of copying them into SVG or cache keys', async () => {
    const req = request(`pass=${'0'.repeat(12000)}42&fail=3`);
    expect(await handleRequest(req).text()).toBe(
      await handleRequest(request('pass=42&fail=3')).text(),
    );
    expect(edgeCacheKey(req)!.url).toBe(
      edgeCacheKey(request('pass=42&fail=3'))!.url,
    );
    expect(
      handleRequest(request(`pass=${'9'.repeat(12000)}&fail=3`)).status,
    ).toBe(400);
    expect(
      handleRequest(request(`pass=${'0'.repeat(12000)}x&fail=3`)).status,
    ).toBe(400);
  });
});
