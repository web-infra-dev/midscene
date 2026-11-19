import { describe, expect, it, rs } from '@rstest/core';
import { deploy } from '../cloudflare/deploy.mjs';
import { rules } from '../cloudflare/redirects.mjs';

// Evaluate the limited Cloudflare expression subset used by this config, so
// cases exercise the actual deployed predicates, targets, and rule ordering.
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

function cloudflare(initial?: Record<string, unknown>[]) {
  let saved = initial;
  const request = rs.fn(async (_url: string, options: RequestInit) => {
    const url = new URL(_url);
    const body = options.body ? JSON.parse(options.body as string) : undefined;
    let result: unknown;
    if (options.method === 'GET' && url.pathname.endsWith('/rulesets')) {
      result = saved
        ? [
            {
              id: 'entry',
              kind: 'zone',
              phase: 'http_request_dynamic_redirect',
            },
          ]
        : [];
    } else if (options.method === 'GET') {
      result = { id: 'entry', rules: saved };
    } else if (url.pathname.endsWith('/rulesets')) {
      saved = body.rules;
      result = { id: 'entry', rules: saved };
    } else {
      const { position, ...rule } = body;
      expect(position).toEqual({ before: '' });
      const id =
        options.method === 'PATCH' ? url.pathname.split('/').at(-1) : rule.ref;
      saved = [{ ...rule, id }, ...saved!.filter((item) => item.id !== id)];
      result = { id: 'entry', rules: saved };
    }
    return {
      ok: true,
      json: async () => ({ success: true, result }),
    } as Response;
  });
  return { request, saved: () => saved };
}

describe('Cloudflare deployment', () => {
  it('creates a missing entry point and verifies the saved rules', async () => {
    const api = cloudflare();
    await deploy({ token: 'test', zone: 'zone', fetch: api.request });
    expect(api.saved()).toEqual(rules);
    expect(api.request).toHaveBeenCalledTimes(3);
  });

  it('updates only owned refs, orders ahead of geo rules and is repeatable', async () => {
    const geo = {
      id: 'geo',
      ref: 'existing_geo',
      expression: 'existing geo rule',
    };
    const api = cloudflare([geo, { ...rules[2], id: 'www', enabled: false }]);
    for (let attempt = 0; attempt < 2; attempt++) {
      await deploy({ token: 'test', zone: 'zone', fetch: api.request });
      expect(api.saved()!.map((rule) => rule.ref)).toEqual([
        ...rules.map((rule) => rule.ref),
        'existing_geo',
      ]);
      expect(api.saved()!.at(-1)).toEqual(geo);
      expect(api.saved()![2].id).toBe('www');
    }
  });

  it('fails on API errors without attempting writes', async () => {
    const request = rs.fn(
      async () =>
        ({
          ok: false,
          status: 403,
          json: async () => ({
            success: false,
            errors: [{ message: 'Forbidden' }],
          }),
        }) as Response,
    );
    await expect(
      deploy({ token: 'test', zone: 'zone', fetch: request }),
    ).rejects.toThrow('403');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('requires credentials before requesting anything', async () => {
    const request = rs.fn();
    await expect(
      deploy({ token: '', zone: '', fetch: request }),
    ).rejects.toThrow('required');
    expect(request).not.toHaveBeenCalled();
  });
});
