import { type RequestListener, type Server, createServer } from 'node:http';
import { type AddressInfo, type Socket, connect } from 'node:net';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import { fetchSiwc } from '../../src/ai-model/service-caller/openai/siwc/network';

// Compatible with the project's Node.js 20 baseline.
function deferred<T>() {
  const state: { resolve?: (value: T) => void } = {};
  const promise = new Promise<T>((resolve) => {
    state.resolve = resolve;
  });
  return { promise, resolve: (value: T) => state.resolve!(value) };
}

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return (server.address() as AddressInfo).port;
}

// A real CONNECT proxy and target on loopback. No external services or credentials.
async function createNetwork(handler: RequestListener) {
  const sockets = new Set<Socket>();
  const target = createServer(handler);
  const proxy = createServer();
  for (const server of [target, proxy]) {
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
  }
  const tunnels: string[] = [];
  const targetPort = await listen(target);
  proxy.on('connect', (request, client, head) => {
    tunnels.push(request.url!);
    const upstream = connect(targetPort, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      client.pipe(upstream).pipe(client);
    });
    sockets.add(upstream);
    upstream.on('close', () => {
      sockets.delete(upstream);
      client.destroy();
    });
    client.on('close', () => upstream.destroy());
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
  });
  const proxyPort = await listen(proxy);
  rs.stubEnv('MIDSCENE_MODEL_HTTP_PROXY', `http://127.0.0.1:${proxyPort}`);
  rs.stubEnv('MIDSCENE_MODEL_SOCKS_PROXY', '');
  return {
    url: `http://127.0.0.1:${targetPort}/token`,
    authority: `127.0.0.1:${targetPort}`,
    tunnels,
    async close() {
      for (const socket of sockets) {
        socket.destroy();
      }
      await Promise.all(
        [target, proxy].map(
          (server) =>
            new Promise<void>((resolve, reject) => {
              server.close((error) => (error ? reject(error) : resolve()));
            }),
        ),
      );
    },
  };
}

afterEach(() => {
  rs.unstubAllEnvs();
});

describe('SIWC real proxy transport', () => {
  it('reads the complete delayed body after the dispatcher starts closing', async () => {
    const finish = deferred<() => void>();
    const network = await createNetwork((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.write('{"access_token":');
      finish.resolve(() => response.end('"test-token"}'));
    });
    try {
      const response = await fetchSiwc(network.url);
      // fetchSiwc has returned and called dispatcher.close(), but the body is incomplete.
      const body = response.json();
      (await finish.promise)();
      await expect(body).resolves.toEqual({ access_token: 'test-token' });
      expect(network.tunnels).toEqual([network.authority]);
    } finally {
      await network.close();
    }
  });

  for (const sendHeaders of [false, true]) {
    it(`cancels ${sendHeaders ? 'while reading the body' : 'before response headers'} and closes the connection`, async () => {
      const received = deferred<void>();
      const closed = deferred<void>();
      const network = await createNetwork((_request, response) => {
        response.on('close', () => closed.resolve());
        if (sendHeaders) {
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.write('{');
        }
        received.resolve();
      });
      try {
        const controller = new AbortController();
        const request = fetchSiwc(network.url, { signal: controller.signal });
        await received.promise;
        const result = sendHeaders ? (await request).text() : request;
        const rejected = expect(result).rejects.toMatchObject({
          name: 'AbortError',
        });
        controller.abort();
        await rejected;
        await closed.promise;
        expect(new Set(network.tunnels)).toEqual(new Set([network.authority]));
      } finally {
        await network.close();
      }
    });
  }
});
