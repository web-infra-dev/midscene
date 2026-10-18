// Single-repository alpha ingress. State is strongly consistent Durable Object storage; evidence uses KV.
const json = (value, status = 200) =>
  Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
export async function handleRelay(req, env, storage) {
  const url = new URL(req.url);
  const p = url.pathname;
  if (p === '/health')
    return json({ ok: true, purpose: 'Midscene Verify live integration' });
  if (
    ![env.WEBHOOK_SECRET, env.RELAY_TOKEN, env.REPORT_TOKEN].every(
      (value) => typeof value === 'string' && value.length >= 32,
    )
  )
    return new Response('Service not configured', { status: 503 });
  if (p === '/webhooks/github' && req.method === 'POST') {
    const body = await req.text();
    if (new TextEncoder().encode(body).byteLength > 1048576)
      return new Response('Too large', { status: 413 });
    const sig = req.headers.get('x-hub-signature-256') ?? '';
    const id = req.headers.get('x-github-delivery') ?? '';
    if (!/^sha256=[a-f0-9]{64}$/.test(sig) || !/^[a-zA-Z0-9-]{1,100}$/.test(id))
      return new Response('Invalid', { status: 401 });
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.WEBHOOK_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const bytes = Uint8Array.from(sig.slice(7).match(/../g), (x) =>
      Number.parseInt(x, 16),
    );
    if (
      !(await crypto.subtle.verify(
        'HMAC',
        key,
        bytes,
        new TextEncoder().encode(body),
      ))
    )
      return new Response('Invalid', { status: 401 });
    await storage.put(
      `delivery/${id}`,
      JSON.stringify({
        body,
        headers: {
          'x-hub-signature-256': sig,
          'x-github-delivery': id,
          'x-github-event': req.headers.get('x-github-event'),
          'content-type': 'application/json',
        },
      }),
    );
    return json({ accepted: true }, 202);
  }
  const admin =
    req.headers.get('authorization') === `Bearer ${env.RELAY_TOKEN}`;
  if (p === '/deliveries' && admin) {
    const list = await storage.list({ prefix: 'delivery/' });
    return json([...list.keys()]);
  }
  if (p.startsWith('/delivery/') && admin) {
    const key = p.slice(1);
    if (req.method === 'DELETE') {
      await storage.delete(key);
      return json({ deleted: true });
    }
    return new Response(await storage.get(key), {
      headers: { 'content-type': 'application/json' },
    });
  }
  if (admin && /^\/state\/(runs|deliveries)(\/[\w-]+)?$/.test(p)) {
    const key = p.slice(1);
    if (req.method === 'PUT') {
      await storage.put(key, await req.json());
      return json({ stored: true });
    }
    if (req.method === 'GET') {
      if (p.split('/').length === 3)
        return json([...(await storage.list({ prefix: `${key}/` })).values()]);
      return json((await storage.get(key)) ?? null);
    }
  }
  const preview = /^\/preview\/(index.html|__revision.json)$/.test(p);
  const report = /^\/verifications\/[a-f0-9]{64}\/[\w.-]+$/.test(p);
  if (!preview && !report) return new Response('Not found', { status: 404 });
  const auth = req.headers.get('authorization') ?? '';
  const canRead =
    admin ||
    auth === `Bearer ${env.REPORT_TOKEN}` ||
    auth === `Basic ${btoa(`verify:${env.REPORT_TOKEN}`)}`;
  if (report && !canRead)
    return new Response('Authentication required', {
      status: 401,
      headers: { 'www-authenticate': 'Basic realm="Midscene Verify"' },
    });
  if (req.method === 'PUT' && admin) {
    await env.DATA.put(p, await req.arrayBuffer(), {
      metadata: {
        type: req.headers.get('content-type') ?? 'application/octet-stream',
      },
    });
    return json({ stored: true });
  }
  if (req.method !== 'GET')
    return new Response('Method not allowed', { status: 405 });
  const item = await env.DATA.getWithMetadata(p, { type: 'arrayBuffer' });
  if (!item.value) return new Response('Not found', { status: 404 });
  const headers = {
    'content-type': item.metadata.type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
  if (report)
    headers['content-security-policy'] =
      "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'";
  return new Response(item.value, { headers });
}
