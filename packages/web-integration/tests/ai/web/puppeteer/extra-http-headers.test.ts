import type { IncomingHttpHeaders } from 'node:http';
import { type Server, createServer } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { launchPage } from './utils';

// End-to-end check that `extraHTTPHeaders` from the web config actually reaches
// the server. A mock-based unit test only proves we call `setExtraHTTPHeaders`;
// this drives a real browser against a local server and inspects what arrived.
describe('extraHTTPHeaders (puppeteer)', () => {
  let server: Server;
  let baseUrl: string;
  let received: IncomingHttpHeaders[] = [];
  let resetFn: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    server = createServer((req, res) => {
      received.push(req.headers);
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body>ok</body></html>');
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${port}/`;
  });

  afterAll(() => {
    server?.close();
  });

  afterEach(async () => {
    received = [];
    if (resetFn) {
      await resetFn();
      resetFn = undefined;
    }
  });

  it('sends custom headers with the request', async () => {
    const { reset } = await launchPage(baseUrl, {
      targetOverrides: {
        extraHTTPHeaders: {
          'X-Custom-Token': 'my-secret-token',
          'X-From-Midscene': 'yes',
        },
      },
    });
    resetFn = reset;

    const docReq = received.find((h) => h['x-custom-token'] !== undefined);
    expect(docReq?.['x-custom-token']).toBe('my-secret-token');
    expect(docReq?.['x-from-midscene']).toBe('yes');
  });

  it('does not send custom headers when not configured', async () => {
    const { reset } = await launchPage(baseUrl);
    resetFn = reset;

    expect(received.length).toBeGreaterThan(0);
    expect(received.some((h) => h['x-custom-token'] !== undefined)).toBe(false);
  });
});
