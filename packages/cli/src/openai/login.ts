import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  type SiwcLoginAttempt,
  createSiwcAuthorization,
  exchangeSiwcCode,
  parseSiwcCallback,
} from '@midscene/core/ai-model';
import type { JWTVerifyGetKey } from 'jose';
import { withSiwcStage } from './errors';

interface LoginOptions {
  hostId?: string;
  clientId?: string;
  port?: number;
  signal: AbortSignal;
  onAuthorization: (url: string) => Promise<void>;
}

interface LoginDependencies {
  fetch: typeof fetch;
  keys: JWTVerifyGetKey;
}

export async function loginWithOpenAI(
  options: LoginOptions,
  dependencies?: LoginDependencies,
) {
  const hostId = options.hostId ?? `urn:uuid:${randomUUID()}`;
  const existingClientId = options.clientId;
  const context: { attempt?: SiwcLoginAttempt } = {};
  const signal = options.signal;
  signal.throwIfAborted();
  const server = createServer();
  const callback = new Promise<{ code: string; clientId: string }>(
    (resolve, reject) => {
      const consumed = { value: false };
      server.on('request', (request, response) => {
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Referrer-Policy', 'no-referrer');
        const url = new URL(request.url || '/', 'http://127.0.0.1');
        if (request.method !== 'GET' || url.pathname !== '/auth/callback') {
          response.writeHead(404).end('Not found');
          return;
        }
        if (!context.attempt) {
          response.writeHead(400).end('Authorization has not started.');
          return;
        }
        if (consumed.value) {
          response.writeHead(409).end('Authorization already received.');
          return;
        }
        const parsed = (() => {
          try {
            return parseSiwcCallback(
              new URL(
                request.url || '/',
                context.attempt.redirectUri,
              ).toString(),
              context.attempt,
            );
          } catch (error) {
            response.writeHead(400).end('Invalid authorization callback.');
            if (url.searchParams.has('error')) {
              consumed.value = true;
              reject(error);
            }
            return undefined;
          }
        })();
        if (!parsed) {
          if (!response.writableEnded) {
            response
              .writeHead(400)
              .end('Invalid login state. Use the original authorization link.');
          }
          return;
        }
        consumed.value = true;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorization received · Midscene</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f6f7f9; color: #202124; font-family: system-ui, sans-serif; }
    main { width: 100%; max-width: 480px; padding: 40px 28px; text-align: center; background: white; border: 1px solid #e5e7eb; border-radius: 20px; box-shadow: 0 8px 32px #00000008; }
    h1 { margin: 0 0 20px; font-size: 24px; line-height: 1.4; }
    h1 span { color: #16834a; }
    p { margin: 8px 0 0; color: #596273; font-size: 15px; line-height: 1.6; }
  </style>
</head>
<body>
  <main>
    <h1><span aria-hidden="true">✓</span> Authorization received</h1>
    <p>You can close this tab.</p>
    <p>Check your terminal for the sign-in result and access token.</p>
  </main>
</body>
</html>`);
        resolve(parsed);
      });
      server.on('error', reject);
    },
  );
  // Attach immediately: browser launch or server startup can fail before awaiting the callback.
  void callback.catch(() => undefined);
  const abort = () =>
    server.emit('error', new Error('OpenAI login cancelled or timed out.'));
  signal.addEventListener('abort', abort, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port ?? 0, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    signal.throwIfAborted();
    const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth/callback`;
    const { attempt, url } = await createSiwcAuthorization({
      hostId,
      clientId: existingClientId,
      redirectUri,
      agentName: 'Midscene',
    });
    context.attempt = attempt;
    await options.onAuthorization(url);
    const result = await withSiwcStage(
      'Authorization callback',
      () => callback,
    );
    return await exchangeSiwcCode(attempt, result, signal, dependencies);
  } finally {
    signal.removeEventListener('abort', abort);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
