import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { rules } from './redirects.mjs';

const phase = 'http_request_dynamic_redirect';

export async function deploy({ token, zone, fetch: request = fetch }) {
  if (!token || !zone) {
    throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID are required');
  }
  const base = `/zones/${encodeURIComponent(zone)}/rulesets`;
  async function api(path, method = 'GET', body = undefined) {
    const response = await request(
      `https://api.cloudflare.com/client/v4${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30000),
      },
    );
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(
        `Cloudflare ${method} ${path}: HTTP ${response.status}; ${JSON.stringify(data.errors)}`,
      );
    }
    return data.result;
  }

  // List first: an authentication/authorization failure must never be treated
  // as an absent entry point.
  const existing = (await api(base)).find(
    (entry) => entry.phase === phase && entry.kind === 'zone',
  );
  let result;
  if (!existing) {
    result = await api(base, 'POST', {
      name: 'Redirect rules',
      kind: 'zone',
      phase,
      rules,
    });
  } else {
    const endpoint = `${base}/${existing.id}`;
    result = await api(endpoint);
    // Mutate only our own stable refs. Existing rules and their relative order
    // are preserved, including the www geo rule configured in the dashboard.
    for (const rule of [...rules].reverse()) {
      const current = result.rules?.find((item) => item.ref === rule.ref);
      result = await api(
        `${endpoint}/rules${current ? `/${current.id}` : ''}`,
        current ? 'PATCH' : 'POST',
        { ...rule, position: { before: '' } },
      );
    }
  }
  const saved = await api(`${base}/${result.id}`);
  for (const [index, rule] of rules.entries()) {
    const actual = saved.rules?.[index];
    if (
      actual?.ref !== rule.ref ||
      actual.expression !== rule.expression ||
      actual.action !== rule.action ||
      actual.enabled !== true ||
      !isDeepStrictEqual(actual.action_parameters, rule.action_parameters)
    ) {
      throw new Error(`Cloudflare read-back mismatch for ${rule.ref}`);
    }
  }
  console.log('Verified apex redirects at the start of the Cloudflare ruleset');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  deploy({
    token: process.env.CLOUDFLARE_API_TOKEN,
    zone: process.env.CLOUDFLARE_ZONE_ID,
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
