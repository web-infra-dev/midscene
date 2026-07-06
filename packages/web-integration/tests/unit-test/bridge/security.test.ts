/**
 * Security tests for Bridge Server (GHSA-mrhp-4xj5-p96f)
 *
 * These tests verify that:
 * 1. Cross-origin WebSocket connections are rejected (CSWSH prevention)
 * 2. Cross-origin kill signals are rejected (DoS prevention)
 *
 * Protection mechanism: Socket.IO middleware checks the Origin header on
 * every connection. Only trusted origins (no Origin = local process, or
 * chrome-extension://) are allowed. Browser pages cannot forge or omit
 * the Origin header on WebSocket handshakes.
 *
 * Before the fix: these tests FAIL, confirming the vulnerabilities.
 * After the fix:  these tests PASS, confirming the vulnerabilities are closed.
 */

import {
  BridgeEvent,
  BridgeSignalKill,
  DefaultBridgeServerHost,
} from '@/bridge-mode/common';
import { BridgeServer, killRunningServer } from '@/bridge-mode/io-server';
import { io as ClientIO } from 'socket.io-client';
import { describe, expect, it } from 'vitest';

const DEFAULT_HOST = DefaultBridgeServerHost;
let portCounter = 3456;
const nextPort = () => portCounter++;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Try to connect via WebSocket with given options, resolve connection result
function tryConnect(
  port: number,
  opts: {
    origin?: string;
    query?: Record<string, string>;
  } = {},
): Promise<{ connected: boolean; gotConnectedEvent: boolean }> {
  return new Promise((resolve) => {
    const client = ClientIO(`ws://localhost:${port}`, {
      extraHeaders: opts.origin ? { Origin: opts.origin } : undefined,
      query: { version: 'test', ...(opts.query || {}) },
      transports: ['websocket'],
      reconnection: false,
    });

    let gotConnectedEvent = false;
    client.on(BridgeEvent.Connected, () => {
      gotConnectedEvent = true;
    });

    client.on('connect', () => {
      // Give a moment for bridge-connected event to fire
      setTimeout(() => {
        client.close();
        resolve({ connected: true, gotConnectedEvent });
      }, 200);
    });
    client.on('connect_error', () => {
      resolve({ connected: false, gotConnectedEvent: false });
    });
    setTimeout(() => {
      client.close();
      resolve({ connected: false, gotConnectedEvent: false });
    }, 2000);
  });
}

describe('Bridge Server Security (GHSA-mrhp-4xj5-p96f)', () => {
  // ─── VULN-1: Cross-origin WebSocket hijacking ────────────────────────────

  it('VULN-1a: rejects connection from browser origin', async () => {
    const port = nextPort();
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();

    // Simulate a webpage at https://evil.com trying to hijack the bridge
    const result = await tryConnect(port, {
      origin: 'https://evil.com',
    });

    // The malicious client must NOT be able to connect
    expect(result.connected).toBe(false);
    expect(result.gotConnectedEvent).toBe(false);

    await server.close();
  }, 10000);

  it('VULN-1b: rejects connections from multiple malicious origins', async () => {
    const port = nextPort();
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();

    const maliciousOrigins = [
      'https://attacker.example.com',
      'http://malicious.net',
      'https://phishing.google.com',
    ];

    for (const origin of maliciousOrigins) {
      const result = await tryConnect(port, { origin });
      expect(result.connected).toBe(false);
      expect(result.gotConnectedEvent).toBe(false);
    }

    await server.close();
  }, 15000);

  it('VULN-1c: prevents session hijack — malicious client cannot intercept commands', async () => {
    const port = nextPort();
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();

    // Malicious client tries to connect first to hijack the session
    const maliciousClient = ClientIO(`ws://localhost:${port}`, {
      extraHeaders: { Origin: 'https://attacker.com' },
      query: { version: 'evil' },
      transports: ['websocket'],
      reconnection: false,
    });

    let hijackSuccess = false;
    const interceptedMethods: string[] = [];

    maliciousClient.on(BridgeEvent.Connected, () => {
      hijackSuccess = true;
    });
    maliciousClient.on(BridgeEvent.Call, (call: any) => {
      interceptedMethods.push(call.method);
      maliciousClient.emit(BridgeEvent.CallResponse, {
        id: call.id,
        response: 'FAKE',
      });
    });

    await new Promise<void>((resolve) => {
      maliciousClient.on('connect', resolve);
      maliciousClient.on('connect_error', () => resolve());
      setTimeout(resolve, 2000);
    });
    await sleep(300);

    // The hijack must not succeed
    expect(hijackSuccess).toBe(false);
    expect(interceptedMethods).toEqual([]);

    maliciousClient.close();
    await server.close();
  }, 10000);

  // ─── VULN-2: Kill signal DoS ─────────────────────────────────────────────

  it('VULN-2a: rejects kill signal from browser origin', async () => {
    const port = nextPort();
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();

    // Connect a legitimate client first (no Origin = local process)
    const legitClient = ClientIO(`ws://localhost:${port}`, {
      query: { version: 'legit' },
      transports: ['websocket'],
      reconnection: false,
    });
    await new Promise<void>((resolve) => {
      legitClient.on(BridgeEvent.Connected, resolve);
      legitClient.on('connect_error', () => resolve());
      setTimeout(resolve, 2000);
    });

    // Set up legit client to respond to calls
    legitClient.on(BridgeEvent.Call, (call: any) => {
      legitClient.emit(BridgeEvent.CallResponse, {
        id: call.id,
        response: 'ok',
      });
    });

    // Simulate malicious webpage sending kill signal
    const maliciousClient = ClientIO(`ws://localhost:${port}`, {
      extraHeaders: { Origin: 'https://evil.com' },
      query: { [BridgeSignalKill]: '1' },
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise<void>((resolve) => {
      maliciousClient.on('connect', () => {
        maliciousClient.close();
        resolve();
      });
      maliciousClient.on('connect_error', () => resolve());
      setTimeout(resolve, 2000);
    });
    await sleep(500);

    // Verify server still works — the kill signal must have been rejected
    const result = await server.call('test', ['a']).catch(() => null);
    expect(result).toBe('ok');

    maliciousClient.close();
    legitClient.close();
    try {
      await server.close();
    } catch {}
  }, 10000);

  it('VULN-2b: killRunningServer still works (legitimate local use)', async () => {
    const port = nextPort();
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();

    // Connect a legitimate client (no Origin = local process)
    const client = ClientIO(`ws://localhost:${port}`, {
      query: { version: 'test' },
      transports: ['websocket'],
      reconnection: false,
    });
    await new Promise<void>((resolve) => {
      client.on(BridgeEvent.Connected, resolve);
      setTimeout(resolve, 2000);
    });

    // killRunningServer (from local process, no Origin header) should still work
    await killRunningServer(port);
    await sleep(300);

    // Server should be dead
    await expect(server.call('test', ['a'])).rejects.toThrow();
    client.close();
  }, 10000);

  // ─── Positive: legitimate flows still work ───────────────────────────────

  it('positive: local process (no Origin) can connect and exchange calls', async () => {
    const port = nextPort();
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();

    let receivedMethod = '';
    const client = ClientIO(`ws://localhost:${port}`, {
      query: { version: 'test' },
      transports: ['websocket'],
      reconnection: false,
    });

    let connected = false;
    client.on(BridgeEvent.Connected, () => {
      connected = true;
    });
    client.on(BridgeEvent.Call, (call: any) => {
      receivedMethod = call.method;
      client.emit(BridgeEvent.CallResponse, {
        id: call.id,
        response: 'ok',
      });
    });

    await new Promise<void>((resolve) => {
      client.on('connect', resolve);
      setTimeout(resolve, 2000);
    });
    await sleep(200);

    expect(connected).toBe(true);

    // Server sends a call, client receives it
    const result = await server.call('screenshotBase64', []);
    expect(result).toBe('ok');
    expect(receivedMethod).toBe('screenshotBase64');

    client.close();
    await server.close();
  }, 10000);

  it('positive: chrome-extension:// origin can connect', async () => {
    const port = nextPort();
    const server = new BridgeServer(DEFAULT_HOST, port);
    await server.listen();

    const extOrigin = 'chrome-extension://admccjkmockfdflocgggjfgdacdodkdf';
    const result = await tryConnect(port, { origin: extOrigin });

    expect(result.connected).toBe(true);
    expect(result.gotConnectedEvent).toBe(true);

    await server.close();
  }, 10000);

  it('positive: closeConflictServer kills old server (no Origin kill signal)', async () => {
    const port = nextPort();
    const server1 = new BridgeServer(DEFAULT_HOST, port);
    await server1.listen({ timeout: false });

    // Connect a client to server1 so we can verify it's alive
    const client1 = ClientIO(`ws://localhost:${port}`, {
      query: { version: 'test' },
      transports: ['websocket'],
      reconnection: false,
    });
    await new Promise<void>((resolve) => {
      client1.on(BridgeEvent.Connected, resolve);
      setTimeout(resolve, 2000);
    });
    client1.on(BridgeEvent.Call, (call: any) => {
      client1.emit(BridgeEvent.CallResponse, { id: call.id, response: 'ok' });
    });
    await sleep(100);

    // Verify server1 is working
    expect(await server1.call('test', ['a'])).toBe('ok');

    // server2 with closeConflictServer=true should kill server1 via kill signal
    const server2 = new BridgeServer(
      DEFAULT_HOST,
      port,
      undefined,
      undefined,
      true,
    );
    // Don't await full listen — it waits for extension connection.
    // Just give killRunningServer time to fire and kill server1.
    server2.listen({ timeout: false }).catch(() => {});
    await sleep(500);

    // server1 should be dead — its io is closed by the kill signal
    let dead = false;
    try {
      await server1.call('test', ['a']);
    } catch {
      dead = true;
    }
    expect(dead).toBe(true);

    client1.close();
    await server2.close();
  }, 15000);
});
