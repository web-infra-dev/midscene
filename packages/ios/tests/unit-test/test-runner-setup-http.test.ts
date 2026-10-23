import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { IOSDevice } from '@midscene/ios';
import { expect, it } from '@rstest/core';
import { createWdaIOSSetup } from '../../src/test-runner';

it.each([false, true])(
  'uses the real WDA HTTP adapter and preserves external session ownership: %s',
  async (externalSession) => {
    const requests: string[] = [];
    const server = createServer((request, response) => {
      const route = `${request.method} ${request.url}`;
      requests.push(route);
      response.setHeader('Content-Type', 'application/json');
      let body: unknown;
      if (request.url === '/gateway/status') {
        body = {
          sessionId: 'session',
          device: {
            udid: 'http-test-device',
            name: 'Test iPhone',
            model: 'iPhone',
          },
        };
      } else if (route === 'POST /gateway/session') {
        body = { value: { sessionId: 'session', capabilities: {} } };
      } else if (request.url?.endsWith('/window/rect')) {
        body = { value: { x: 0, y: 0, width: 390, height: 844 } };
      } else if (request.url?.endsWith('/wda/screen')) {
        body = { value: { scale: 3 } };
      } else if (
        request.url?.endsWith('/appium/settings') ||
        route === 'DELETE /gateway/session/session'
      ) {
        body = { value: null };
      } else {
        response.statusCode = 404;
        body = { error: `Unexpected WDA request: ${route}` };
      }
      response.end(JSON.stringify(body));
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const teardowns: Array<() => void | Promise<void>> = [];
    try {
      const { port } = server.address() as AddressInfo;
      const setup = createWdaIOSSetup({
        wdaBaseUrl: `http://127.0.0.1:${port}/gateway`,
        ...(externalSession ? { sessionId: 'session' } : {}),
        modelConfig: {
          MIDSCENE_MODEL_NAME: 'mock',
          MIDSCENE_MODEL_API_KEY: 'mock',
          MIDSCENE_MODEL_BASE_URL: 'https://model.example.invalid',
          MIDSCENE_MODEL_FAMILY: 'doubao-vision',
        },
      });
      const { agent } = await setup.setup({
        env: {},
        signal: new AbortController().signal,
        onTeardown(callback) {
          teardowns.push(callback);
        },
      });
      expect(agent.interface).toBeInstanceOf(IOSDevice);
      expect(await agent.interface.getConnectedDeviceInfo()).toMatchObject({
        udid: 'http-test-device',
      });
      expect(requests.includes('POST /gateway/session')).toBe(!externalSession);
      await teardowns.pop()!();
      expect(requests.includes('DELETE /gateway/session/session')).toBe(
        !externalSession,
      );
      expect(requests).toContain('GET /gateway/session/session/window/rect');
    } finally {
      for (const cleanup of teardowns.reverse()) await cleanup();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
);
