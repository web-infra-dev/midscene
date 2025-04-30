import { BridgeSignalKill } from '@/bridge-mode/common';
import { BridgeClient } from '@/bridge-mode/io-client';
import { BridgeServer, killRunningServer } from '@/bridge-mode/io-server';
import { describe, expect, it, vi } from 'vitest';

let testPort = 1234;
describe('bridge-io', () => {
  it('server launch and close', () => {
    const server = new BridgeServer(testPort++);
    server.listen();
    server.close();
  });

  it('server already listening', async () => {
    const port = testPort++;
    const server = new BridgeServer(port);
    server.listen();
    await expect(server.listen()).rejects.toThrow();
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

    // client should be closed automatically
    // client.disconnect();

    const onDisconnect = vi.fn();
    const client2 = new BridgeClient(
      `ws://localhost:${port}`,
      (method, args) => {
        return Promise.resolve('ok');
      },
      onDisconnect,
    );
    await expect(client2.connect()).rejects.toThrow();
    expect(onDisconnect).not.toHaveBeenCalled();

    await server.close();
  });

  it('server start, client connect, server restart on same port', async () => {
    //
    const port = testPort++;
    const server = new BridgeServer(port);
    server.listen();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await server.close();

    const server2 = new BridgeServer(port);
    server2.listen();
    await server2.close();
  });

  it('server on same port', async () => {
    const port = testPort++;
    const server = new BridgeServer(port);
    await server.listen();

    const server2 = new BridgeServer(port);
    await expect(server2.listen()).rejects.toThrow();
    await server.close();
  });

  it('server on same port - close conflict server', async () => {
    const port = testPort++;
    const server = new BridgeServer(port);
    await server.listen();

    const server2 = new BridgeServer(port, undefined, undefined, true);
    await server2.listen();
    await server.close();
  });

  it('server kill', async () => {
    const port = testPort++;
    const server = new BridgeServer(port);
    await server.listen();

    const client = new BridgeClient(
      `ws://localhost:${port}`,
      (method, args) => {
        return Promise.resolve('ok');
      },
    );
    await client.connect();
    await server.call('test', ['a', 'b']);
    await killRunningServer(port);
    expect(server.call('test2', ['a', 'b'])).rejects.toThrow();
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

  it('callback error after client disconnect', async () => {
    const port = testPort++;
    const server = new BridgeServer(port);
    server.listen();

    const client = new BridgeClient(
      `ws://localhost:${port}`,
      (method, args) => {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            resolve('ok');
          }, 100 * 1000);
        });
      },
    );
    await client.connect();

    const callPromise = server.call('test', ['a', 'b']);

    // sleep 2s
    await new Promise((resolve) => setTimeout(resolve, 2 * 1000));

    await client.disconnect();
    await expect(callPromise).rejects.toThrow(/Connection lost/);
  });

  it('server restart on same port', async () => {
    const commonPort = testPort++;
    const server1 = new BridgeServer(commonPort);
    server1.listen();

    const client = new BridgeClient(
      `ws://localhost:${commonPort}`,
      (method, args) => {
        return Promise.resolve('ok');
      },
    );
    await client.connect();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await client.disconnect();
    // server port should be closed at this time
    await new Promise((resolve) => setTimeout(resolve, 500));

    const server2 = new BridgeServer(commonPort);
    server2.listen();

    const client2 = new BridgeClient(
      `ws://localhost:${commonPort}`,
      (method, args) => {
        return Promise.resolve('ok2');
      },
    );
    await client2.connect();

    const res = await server2.call('test', ['a', 'b']);
    expect(res).toEqual('ok2');
  });
});
