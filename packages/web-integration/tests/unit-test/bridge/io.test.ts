import { BridgeClient } from '@/bridge-mode/io-client';
import { BridgeServer } from '@/bridge-mode/io-server';
import { describe, expect, it, vi } from 'vitest';

let testPort = 1234;
describe('bridge-io', () => {
  it('server launch and close', () => {
    const server = new BridgeServer(testPort++);
    server.listen();
    server.close();
  });

  it('refuse 2nd client connection', async () => {
    const port = testPort++;
    const server = new BridgeServer(port);
    server.listen();
    const client = new BridgeClient(
      `ws://localhost:${port}`,
      (method, args) => {
        return Promise.resolve('ok');
      },
    );
    await client.connect();

    const client2 = new BridgeClient(
      `ws://localhost:${port}`,
      (method, args) => {
        return Promise.resolve('ok');
      },
    );
    await expect(client2.connect()).rejects.toThrow();

    server.close();
    client.disconnect();
  });

  it('server listen timeout', async () => {
    const server = new BridgeServer(testPort++);
    await expect(server.listen(100)).rejects.toThrow();
  });

  it('server and client communicate', async () => {
    const port = testPort++;
    const method = 'test';
    const args = ['a', 'b', { foo: 'bar' }];
    const responseValue = { hello: 'world' };

    const server = new BridgeServer(port);
    server.listen();
    const client = new BridgeClient(
      `ws://localhost:${port}`,
      (method, args) => {
        expect(method).toBe(method);
        expect(args).toEqual(args);
        return Promise.resolve(responseValue);
      },
    );
    await client.connect();

    const response = await server.call(method, args);
    expect(response).toEqual(responseValue);

    server.close();
    client.disconnect();
  });

  it('client call error', async () => {
    const port = testPort++;
    const server = new BridgeServer(port);
    const errMsg = 'internal error';
    server.listen();

    const client = new BridgeClient(
      `ws://localhost:${port}`,
      (method, args) => {
        return Promise.reject(new Error(errMsg));
      },
    );

    await client.connect();
    // await server.call('test', ['a', 'b']);
    expect(server.call('test', ['a', 'b'])).rejects.toThrow(errMsg);
  });

  it('client disconnect event', async () => {
    const port = testPort++;
    const server = new BridgeServer(port);
    server.listen();

    const fn = vi.fn();

    const client = new BridgeClient(
      `ws://localhost:${port}`,
      (method, args) => {
        return Promise.resolve('ok');
      },
      fn,
    );

    await client.connect();

    await server.close();

    // sleep 1s
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(fn).toHaveBeenCalled();
  });

  it('client close before server', async () => {
    const port = testPort++;
    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const server = new BridgeServer(port, onConnect, onDisconnect);
    server.listen();

    const client = new BridgeClient(`ws://localhost:${port}`, () => {
      return Promise.resolve('ok');
    });
    await client.connect();

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(onConnect).toHaveBeenCalled();

    expect(onDisconnect).not.toHaveBeenCalled();
    await client.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(onDisconnect).toHaveBeenCalled();
  });

  it('flush all calls before connecting', async () => {
    const port = testPort++;
    const server = new BridgeServer(port);
    server.listen();

    const client = new BridgeClient(
      `ws://localhost:${port}`,
      (method, args) => {
        return Promise.resolve('ok');
      },
    );

    const call = server.call('test', ['a', 'b']);
    const call2 = server.call('test2', ['a', 'b']);

    await new Promise((resolve) => setTimeout(resolve, 100));
    await client.connect();
    const response = await call;
    expect(response).toEqual('ok');

    const response2 = await call2;
    expect(response2).toEqual('ok');

    server.close();
    client.disconnect();
  });

  it('server timeout', async () => {
    const port = testPort++;
    const server = new BridgeServer(port);
    server.listen();

    const client = new BridgeClient(
      `ws://localhost:${port}`,
      (method, args) => {
        throw new Error('internal error');
      },
    );
    await client.connect();

    expect(server.call('test', ['a', 'b'], 1000)).rejects.toThrow();

    server.close();
    client.disconnect();
  });
});
