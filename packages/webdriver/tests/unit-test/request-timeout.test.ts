import { createServer } from 'node:http';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import {
  WebDriverRequestError,
  WebDriverRequestTimeoutError,
  makeWebDriverRequest,
} from '../../src/utils/request';

afterEach(() => {
  rs.restoreAllMocks();
  rs.useRealTimers();
});

describe('WebDriver response body timeout', () => {
  it.each(['application/json', 'text/plain'])(
    'keeps the request deadline while reading %s',
    async (contentType) => {
      let headersSent = false;
      const server = createServer((_request, response) => {
        response.writeHead(200, { 'Content-Type': contentType });
        response.flushHeaders();
        headersSent = true;
        // Complete eventually so a regression fails instead of hanging.
        const timer = setTimeout(() => response.end('{"value":null}'), 500);
        response.on('close', () => clearTimeout(timer));
      });
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      );
      try {
        const address = server.address();
        if (!address || typeof address === 'string')
          throw new Error('Missing server port');
        await expect(
          makeWebDriverRequest(
            `http://127.0.0.1:${address.port}`,
            'GET',
            '/slow-body',
            undefined,
            200,
          ),
        ).rejects.toBeInstanceOf(WebDriverRequestTimeoutError);
        expect(headersSent).toBe(true);
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  );

  it.each([
    'success',
    'protocol-error',
    'invalid-json',
    'network-error',
  ] as const)('releases the timer after %s', async (outcome) => {
    rs.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    rs.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
      signal = options?.signal;
      if (outcome === 'network-error') throw new Error('connection lost');
      return new Response(outcome === 'invalid-json' ? '{' : '{"value":null}', {
        status: outcome === 'protocol-error' ? 404 : 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const request = makeWebDriverRequest(
      'http://localhost',
      'GET',
      '/status',
      undefined,
      25,
    );
    if (outcome === 'success')
      await expect(request).resolves.toEqual({ value: null });
    else await expect(request).rejects.toBeInstanceOf(WebDriverRequestError);
    await rs.advanceTimersByTimeAsync(100);
    expect(signal?.aborted).toBe(false);
  });
});
