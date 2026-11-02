import { afterEach, beforeEach, describe, expect, it } from '@rstest/core';
import {
  BADGE_VERSION,
  CACHE_CONTROL,
  handleRequest,
  parseBadgeOptions,
} from '../src/badge';
import worker from '../src/index';
import { formatPassRate, renderBadge } from '../src/render';

const ORIGIN = 'https://badge.example.com';
const get = (path: string, headers?: HeadersInit) =>
  new Request(`${ORIGIN}${path}`, { headers });

describe('parseBadgeOptions', () => {
  it('applies defaults for style and theme', () => {
    expect(parseBadgeOptions(new URLSearchParams('pass=42&fail=3'))).toEqual({
      pass: 42,
      fail: 3,
      style: 'flat',
      theme: 'light',
    });
  });

  it.each([
    ['fail=3', /Missing required query parameter "pass"/],
    ['pass=1', /Missing required query parameter "fail"/],
    ['pass=-1&fail=0', /"pass" must be an integer/],
    ['pass=1.5&fail=0', /"pass" must be an integer/],
    ['pass=abc&fail=0', /"pass" must be an integer/],
    ['pass=1&fail=99999999', /"fail" must be an integer/],
    ['pass=1&fail=0&style=round', /"style" must be one of flat, large, card/],
    ['pass=1&fail=0&theme=blue', /"theme" must be one of light, dark/],
  ])('rejects %s', (query, message) => {
    expect(() => parseBadgeOptions(new URLSearchParams(query))).toThrow(
      message,
    );
  });
});

describe('renderBadge', () => {
  it.each(['flat', 'large', 'card'] as const)(
    'renders %s with the counts and an accessible label',
    (style) => {
      const svg = renderBadge({ pass: 42, fail: 3, style, theme: 'light' });
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(
        true,
      );
      expect(svg).toContain('aria-label="Midscene Test: 42 passed, 3 failed"');
      expect(svg).toContain('>42 passed</text>');
      expect(svg).toContain('>3 failed</text>');
      expect(svg).toContain('href="data:image/png;base64,');
    },
  );

  it('labels single-line badges as E2E and the card as Midscene Test', () => {
    const flat = renderBadge({
      pass: 1,
      fail: 0,
      style: 'flat',
      theme: 'light',
    });
    const card = renderBadge({
      pass: 1,
      fail: 0,
      style: 'card',
      theme: 'light',
    });
    expect(flat).toContain('>E2E</text>');
    expect(card).toContain('>Midscene Test</text>');
    expect(card).toContain('>1 tests</text>');
  });

  it('uses red for failures and grey when nothing failed', () => {
    const failed = renderBadge({
      pass: 1,
      fail: 2,
      style: 'flat',
      theme: 'light',
    });
    const clean = renderBadge({
      pass: 1,
      fail: 0,
      style: 'flat',
      theme: 'light',
    });
    expect(failed).toContain('fill="#D73A49"');
    expect(clean).not.toContain('fill="#D73A49"');
    expect(clean).toContain('fill="#8B949E"');
  });

  it('grows with the digit count', () => {
    const width = (pass: number) =>
      Number(
        /width="(\d+)"/.exec(
          renderBadge({ pass, fail: 0, style: 'flat', theme: 'light' }),
        )![1],
      );
    expect(width(1234567)).toBeGreaterThan(width(1));
  });

  it('formats the pass rate', () => {
    expect(formatPassRate(42, 3)).toBe('93.3%');
    expect(formatPassRate(5, 0)).toBe('100%');
    expect(formatPassRate(0, 5)).toBe('0%');
    expect(formatPassRate(0, 0)).toBe('0%');
  });
});

describe('handleRequest', () => {
  it('serves an svg with aggressive cache headers', async () => {
    const res = handleRequest(get('/badge.svg?pass=42&fail=3&style=card'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe(
      'image/svg+xml; charset=utf-8',
    );
    expect(res.headers.get('Cache-Control')).toBe(CACHE_CONTROL);
    expect(CACHE_CONTROL).toContain('max-age=86400');
    expect(res.headers.get('ETag')).toBe(`"v${BADGE_VERSION}-card-light-42-3"`);
    expect(await res.text()).toContain('93.3%');
  });

  it('returns 400 with a reason and does not cache it', async () => {
    const res = handleRequest(get('/badge.svg?pass=1'));
    expect(res.status).toBe(400);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.text()).toContain('Missing required query parameter');
  });

  it('serves usage on / and 404 elsewhere', async () => {
    expect(await handleRequest(get('/')).text()).toContain('/badge.svg?pass=');
    expect(handleRequest(get('/nope')).status).toBe(404);
  });

  it('rejects non-GET methods', () => {
    const res = handleRequest(
      new Request(`${ORIGIN}/badge.svg?pass=1&fail=0`, { method: 'POST' }),
    );
    expect(res.status).toBe(405);
  });

  it('returns no body for HEAD', async () => {
    const res = handleRequest(
      new Request(`${ORIGIN}/badge.svg?pass=1&fail=0`, { method: 'HEAD' }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });
});

describe('worker fetch with edge cache', () => {
  const store = new Map<string, Response>();
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => pending.push(p),
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;
  const fetchBadge = async (request: Request) => {
    const res = await worker.fetch(
      request as Parameters<typeof worker.fetch>[0],
      {},
      ctx,
    );
    await Promise.all(pending);
    return res;
  };

  beforeEach(() => {
    store.clear();
    (globalThis as { caches?: unknown }).caches = {
      default: {
        match: async (req: Request) => store.get(req.url)?.clone(),
        put: async (req: Request, res: Response) => {
          store.set(req.url, res);
        },
      },
    };
  });

  afterEach(() => {
    (globalThis as { caches?: unknown }).caches = undefined;
  });

  it('shares one cache entry regardless of param order or defaults', async () => {
    await fetchBadge(get('/badge.svg?fail=3&pass=42'));
    await fetchBadge(get('/badge.svg?pass=42&fail=3&style=flat&theme=light'));
    expect([...store.keys()]).toEqual([
      `${ORIGIN}/badge.svg?v=${BADGE_VERSION}&style=flat&theme=light&pass=42&fail=3`,
    ]);
  });

  it('answers revalidation with 304', async () => {
    const first = await fetchBadge(get('/badge.svg?pass=42&fail=3'));
    const etag = first.headers.get('ETag')!;
    const res = await fetchBadge(
      get('/badge.svg?pass=42&fail=3', { 'If-None-Match': etag }),
    );
    expect(res.status).toBe(304);
    expect(res.headers.get('Cache-Control')).toBe(CACHE_CONTROL);
  });

  it('does not cache invalid requests', async () => {
    const res = await fetchBadge(get('/badge.svg?pass=x&fail=0'));
    expect(res.status).toBe(400);
    expect(store.size).toBe(0);
  });
});
