import {
  type BadgeOptions,
  type BadgeStyle,
  type BadgeTheme,
  renderBadge,
} from './render';

// Bump when the rendered output changes so edge caches pick up the new design.
export const BADGE_VERSION = '1';

// The design rarely changes, so cache aggressively: 24h in browsers and
// proxies (GitHub camo), 24h at the Cloudflare edge.
export const CACHE_CONTROL = 'public, max-age=86400, s-maxage=86400';

const MAX_COUNT = 9_999_999;
const STYLES: BadgeStyle[] = ['flat', 'large', 'card'];
const THEMES: BadgeTheme[] = ['light', 'dark'];

const USAGE = `Midscene Test badge

GET /badge.svg?pass=<n>&fail=<n>[&style=flat|large|card][&theme=light|dark]

  pass, fail  required, non-negative integers
  style       flat (default, 20px), large (28px) or card (two lines)
  theme       light (default) or dark, only used by style=card

Example: /badge.svg?pass=42&fail=3&style=card
`;

export class BadRequestError extends Error {}

function parseCount(params: URLSearchParams, name: string): number {
  const raw = params.get(name);
  if (raw === null) {
    throw new BadRequestError(`Missing required query parameter "${name}"`);
  }
  if (!/^\d+$/.test(raw) || Number(raw) > MAX_COUNT) {
    throw new BadRequestError(
      `"${name}" must be an integer between 0 and ${MAX_COUNT}, got "${raw}"`,
    );
  }
  return Number(raw);
}

function parseEnum<T extends string>(
  params: URLSearchParams,
  name: string,
  allowed: T[],
): T {
  const raw = params.get(name) ?? allowed[0];
  if (!allowed.includes(raw as T)) {
    throw new BadRequestError(
      `"${name}" must be one of ${allowed.join(', ')}, got "${raw}"`,
    );
  }
  return raw as T;
}

export function parseBadgeOptions(params: URLSearchParams): BadgeOptions {
  return {
    pass: parseCount(params, 'pass'),
    fail: parseCount(params, 'fail'),
    style: parseEnum(params, 'style', STYLES),
    theme: parseEnum(params, 'theme', THEMES),
  };
}

export function badgeETag({ pass, fail, style, theme }: BadgeOptions) {
  return `"v${BADGE_VERSION}-${style}-${theme}-${pass}-${fail}"`;
}

function textResponse(body: string, status: number, cacheControl: string) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': cacheControl,
    },
  });
}

export function handleRequest(request: Request): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }

  const url = new URL(request.url);
  if (url.pathname === '/') {
    return textResponse(USAGE, 200, CACHE_CONTROL);
  }
  if (url.pathname !== '/badge.svg') {
    return textResponse(`Not Found\n\n${USAGE}`, 404, 'no-store');
  }

  let options: BadgeOptions;
  try {
    options = parseBadgeOptions(url.searchParams);
  } catch (error) {
    if (error instanceof BadRequestError) {
      return textResponse(`${error.message}\n\n${USAGE}`, 400, 'no-store');
    }
    throw error;
  }

  return new Response(request.method === 'HEAD' ? null : renderBadge(options), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': CACHE_CONTROL,
      ETag: badgeETag(options),
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/** Answers `If-None-Match` revalidation with 304 when the ETag matches. */
export function withConditional(
  request: Request,
  response: Response,
): Response {
  const etag = response.headers.get('ETag');
  if (etag && request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304, headers: response.headers });
  }
  return response;
}

// Cache key with sorted, validated params so `?fail=3&pass=42` and
// `?pass=42&fail=3&style=flat` share one edge cache entry.
export function edgeCacheKey(request: Request): Request | null {
  const url = new URL(request.url);
  if (url.pathname !== '/badge.svg') return null;
  let options: BadgeOptions;
  try {
    options = parseBadgeOptions(url.searchParams);
  } catch {
    return null;
  }
  const key = new URL('/badge.svg', url.origin);
  key.searchParams.set('v', BADGE_VERSION);
  key.searchParams.set('style', options.style);
  key.searchParams.set('theme', options.theme);
  key.searchParams.set('pass', String(options.pass));
  key.searchParams.set('fail', String(options.fail));
  return new Request(key.toString());
}
