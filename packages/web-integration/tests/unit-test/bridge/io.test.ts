import { BridgeSignalKill } from '@/bridge-mode/common';
import { BridgeClient } from '@/bridge-mode/io-client';
import { BridgeServer, killRunningServer } from '@/bridge-mode/io-server';
import { describe, expect, it, vi } from 'vitest';

const DEFAULT_HOST = '127.0.0.1';
let testPort = 1234;
describe('bridge-io', () => {
  it('server launch and close', () => {
    const server = new BridgeServer(DEFAULT_HOST, testPort++);
    server.listen();
    server.close();
  });

  it('server already listening', async () => {
    const port = testPort++;
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();
    await expect(server.listen()).rejects.toThrow();
    server.close();
  });

  it('refuse 2nd client connection', async () => {
    const port = testPort++;
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();
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
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();
    await server.close();

    const server2 = new BridgeServer(DEFAULT_HOST, port);
    await server2.listen();
    await server2.close();
  });

  it('server on same port', async () => {
    const port = testPort++;
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();

    const server2 = new BridgeServer(DEFAULT_HOST, port);
    await expect(server2.listen()).rejects.toThrow();
    await server.close();
  });

  it('server on same port - close conflict server', async () => {
    const port = testPort++;
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();

    const server2 = new BridgeServer(
      DEFAULT_HOST,
      port,
      undefined,
      undefined,
      true,
    );
    await server2.listen();
    await server.close();
  });

  it('server kill', async () => {
    const port = testPort++;
    const server = new BridgeServer(DEFAULT_HOST, port);
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
    await expect(server.call('test2', ['a', 'b'])).rejects.toThrow();
  });

  it('server and client communicate', async () => {
    const port = testPort++;
    const method = 'test';
    const args = ['a', 'b', { foo: 'bar' }];
    const responseValue = { hello: 'world' };

    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();
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
    const server = new BridgeServer(DEFAULT_HOST, port);
    const errMsg = 'internal error';
    await server.listen();

    const client = new BridgeClient(
      `ws://localhost:${port}`,
      (method, args) => {
        return Promise.reject(new Error(errMsg));
      },
    );

    await client.connect();
    // await server.call('test', ['a', 'b']);
    await expect(server.call('test', ['a', 'b'])).rejects.toThrow(errMsg);
  });

  it('client disconnect event', async () => {
    const port = testPort++;
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();

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
    const server = new BridgeServer(
      DEFAULT_HOST,
      port,
      onConnect,
      onDisconnect,
    );
    await server.listen();

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
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();

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
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();

    const client = new BridgeClient(
      `ws://localhost:${port}`,
      (method, args) => {
        throw new Error('internal error');
      },
    );
    await client.connect();

    await expect(server.call('test', ['a', 'b'], 1000)).rejects.toThrow();

    server.close();
    client.disconnect();
  });

  it('callback error after client disconnect', async () => {
    const port = testPort++;
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();

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

  it('reproduces race condition: calls bypass confirmation when gate set after connect', async () => {
    // This test demonstrates the OLD buggy behavior where confirmationPromise
    // was set AFTER connect(), allowing queued calls to bypass the check.
    const port = testPort++;
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();

    const callOrder: string[] = [];

    // Simulate OLD behavior: no gate before connect
    let confirmationPromise: Promise<boolean> | null = null;
    let resolveConfirmation!: (allowed: boolean) => void;

    const client = new BridgeClient(
      `ws://localhost:${port}`,
      async (method, args) => {
        // Same check as page-browser-side.ts
        if (confirmationPromise) {
          const allowed = await confirmationPromise;
          if (!allowed) throw new Error('Connection denied by user');
        }
        callOrder.push(`processed:${method}`);
        return 'ok';
      },
    );

    // Queue call before connect (CLI does this)
    const queuedCall = server.call('connectNewTabWithUrl', [
      'https://example.com',
    ]);

    // OLD: connect first, THEN set gate — too late!
    await client.connect();

    // Gate set after connect — queued call already arrived and bypassed the check
    confirmationPromise = new Promise<boolean>((resolve) => {
      resolveConfirmation = resolve;
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    // BUG: call was processed without waiting for confirmation!
    expect(callOrder).toEqual(['processed:connectNewTabWithUrl']);

    resolveConfirmation(true);
    await queuedCall;

    await server.close();
    client.disconnect();
  });

  it('queued calls should be blocked by confirmation gate', async () => {
    // Reproduces the race condition: server queues a call before client connects.
    // After connection, the queued call arrives at the client immediately.
    // Without a confirmation gate, the call executes before the caller can
    // set up a confirmation promise (simulating `onConnectionRequest` in the
    // Chrome extension's bridge page).
    //
    // This simulates the flow in page-browser-side.ts:
    //   1. Set confirmationPromise (deferred) BEFORE connect()
    //   2. connect() → server sends queued calls → onBridgeCall blocks on promise
    //   3. Confirmation resolves → calls proceed
    const port = testPort++;
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();

    const callOrder: string[] = [];

    // Simulate the confirmation gate pattern used in page-browser-side.ts
    let resolveConfirmation!: (allowed: boolean) => void;
    const confirmationPromise = new Promise<boolean>((resolve) => {
      resolveConfirmation = resolve;
    });

    const client = new BridgeClient(
      `ws://localhost:${port}`,
      async (method, args) => {
        // Block on confirmation before processing, just like page-browser-side.ts
        const allowed = await confirmationPromise;
        if (!allowed) {
          throw new Error('Connection denied by user');
        }
        callOrder.push(`processed:${method}`);
        return 'ok';
      },
    );

    // Queue a call on the server BEFORE client connects (this is what
    // the CLI does: agent.connectNewTabWithUrl() queues a bridge call)
    const queuedCall = server.call('connectNewTabWithUrl', [
      'https://example.com',
    ]);

    // Client connects - server will immediately send the queued call
    await client.connect();

    // Give time for the queued call to arrive at the client
    await new Promise((resolve) => setTimeout(resolve, 200));

    // The call should NOT have been processed yet (blocked by confirmation)
    expect(callOrder).toEqual([]);

    // Now simulate user clicking "Allow"
    resolveConfirmation(true);

    // The queued call should now complete
    const response = await queuedCall;
    expect(response).toEqual('ok');
    expect(callOrder).toEqual(['processed:connectNewTabWithUrl']);

    await server.close();
    client.disconnect();
  });

  it('queued calls should be rejected when confirmation denied', async () => {
    const port = testPort++;
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();

    let resolveConfirmation!: (allowed: boolean) => void;
    const confirmationPromise = new Promise<boolean>((resolve) => {
      resolveConfirmation = resolve;
    });

    const client = new BridgeClient(
      `ws://localhost:${port}`,
      async (method, args) => {
        const allowed = await confirmationPromise;
        if (!allowed) {
          throw new Error('Connection denied by user');
        }
        return 'ok';
      },
    );

    const queuedCall = server.call('connectNewTabWithUrl', [
      'https://example.com',
    ]);

    await client.connect();
    await new Promise((resolve) => setTimeout(resolve, 200));

    // User clicks "Deny"
    resolveConfirmation(false);

    // The queued call should be rejected
    await expect(queuedCall).rejects.toThrow(/denied/i);

    await server.close();
    client.disconnect();
  });

  it('server restart on same port', async () => {
    const commonPort = testPort++;
    const server1 = new BridgeServer(DEFAULT_HOST, commonPort);
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
    // Server no longer auto-closes on client disconnect, close explicitly
    await server1.close();
    await new Promise((resolve) => setTimeout(resolve, 500));

    const server2 = new BridgeServer(DEFAULT_HOST, commonPort);
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

  it('client reconnect after disconnect without server restart', async () => {
    // Simulates: extension Stop → extension Start → reconnect to same server
    const port = testPort++;
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();

    const client1 = new BridgeClient(
      `ws://localhost:${port}`,
      (method, args) => {
        return Promise.resolve('response1');
      },
    );
    await client1.connect();

    const res1 = await server.call('test', ['a']);
    expect(res1).toEqual('response1');

    // Extension clicks Stop → client disconnects
    await client1.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Extension clicks Start → new client connects to the SAME server
    const client2 = new BridgeClient(
      `ws://localhost:${port}`,
      (method, args) => {
        return Promise.resolve('response2');
      },
    );
    await client2.connect();

    const res2 = await server.call('test2', ['b']);
    expect(res2).toEqual('response2');

    await server.close();
    client2.disconnect();
  });
});
