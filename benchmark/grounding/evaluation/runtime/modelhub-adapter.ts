import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';

// Transport only: the SDK request/response bodies are forwarded unchanged.
export async function startModelHubAdapter(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
}) {
  if (!input.apiKey || !input.model)
    throw new Error('ModelHub requires model and API key');
  const upstream = new URL(`${input.baseUrl.replace(/\/$/, '')}/v2/crawl`);
  upstream.searchParams.set('ak', input.apiKey);
  const server = http.createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404).end();
      return;
    }
    try {
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 64 * 1024 * 1024) throw new Error('Request too large');
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const payload = JSON.parse(body.toString());
      if (payload.model !== input.model || !Array.isArray(payload.messages))
        throw new Error('Unexpected model or payload');
      const result = await fetch(upstream, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(180_000),
      });
      if (!result.body) throw new Error('Empty ModelHub response');
      response.writeHead(result.status, {
        'content-type':
          result.headers.get('content-type') || 'application/json',
      });
      Readable.fromWeb(result.body as Parameters<typeof Readable.fromWeb>[0])
        .on('error', () => response.destroy())
        .pipe(response);
    } catch {
      if (!response.headersSent)
        response
          .writeHead(502, { 'content-type': 'application/json' })
          .end(
            JSON.stringify({ error: { message: 'ModelHub transport failed' } }),
          );
      else response.destroy();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
