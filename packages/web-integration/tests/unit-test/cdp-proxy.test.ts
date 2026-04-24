import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';

const PROXY_ENDPOINT_FILE = join(tmpdir(), 'midscene-cdp-proxy-endpoint');
const PROXY_PID_FILE = join(tmpdir(), 'midscene-cdp-proxy-pid');
const PROXY_UPSTREAM_FILE = join(tmpdir(), 'midscene-cdp-proxy-upstream');
const PROXY_SCRIPT = join(__dirname, '../../dist/lib/cdp-proxy.js');

/**
 * Spin up a fake "Chrome" WebSocket server that echoes CDP messages.
 */
function createFakeChrome(): Promise<{
  server: Server;
  wss: WebSocketServer;
  port: number;
  endpoint: string;
  clients: Set<WebSocket>;
}> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    const wss = new WebSocketServer({ server });
    const clients = new Set<WebSocket>();

    wss.on('connection', (ws) => {
      clients.add(ws);
      ws.on('message', (data) => {
        // Echo back with a fake CDP response
        const msg = JSON.parse(data.toString());
        ws.send(
          JSON.stringify({
            id: msg.id,
            result: {
              targetInfos: [
                {
                  type: 'page',
                  title: 'Test Page',
                  url: 'https://test.com',
                  targetId: 'abc',
                },
              ],
            },
          }),
        );
      });
      ws.on('close', () => clients.delete(ws));
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('bad addr');
      const port = addr.port;
      const endpoint = `ws://127.0.0.1:${port}`;
      resolve({ server, wss, port, endpoint, clients });
    });
  });
}

/**
 * Start a proxy process against the given fake Chrome endpoint.
 */
function startProxy(chromeEndpoint: string): Promise<{
  proc: ChildProcess;
  proxyEndpoint: string;
}> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [PROXY_SCRIPT, chromeEndpoint], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const timer = setTimeout(
      () => reject(new Error(`Proxy startup timeout. stderr: ${stderrBuf}`)),
      10000,
    );

    let stderrBuf = '';
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    proc.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      try {
        const parsed = JSON.parse(output.trim());
        if (parsed.endpoint) {
          clearTimeout(timer);
          resolve({ proc, proxyEndpoint: parsed.endpoint });
        }
      } catch {
        // incomplete JSON, wait for more
      }
    });

    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Proxy exited with code ${code}. stderr: ${stderrBuf}`));
    });
  });
}

function cleanupFiles() {
  try {
    if (existsSync(PROXY_ENDPOINT_FILE)) unlinkSync(PROXY_ENDPOINT_FILE);
  } catch {}
  try {
    if (existsSync(PROXY_PID_FILE)) unlinkSync(PROXY_PID_FILE);
  } catch {}
  try {
    if (existsSync(PROXY_UPSTREAM_FILE)) unlinkSync(PROXY_UPSTREAM_FILE);
  } catch {}
}

describe('CDP WebSocket Proxy', () => {
  let fakeChrome: Awaited<ReturnType<typeof createFakeChrome>>;
  let proxyProc: ChildProcess | null = null;

  beforeAll(async () => {
    cleanupFiles();
    fakeChrome = await createFakeChrome();
  });

  afterEach(() => {
    if (proxyProc && !proxyProc.killed) {
      proxyProc.kill('SIGTERM');
      proxyProc = null;
    }
    cleanupFiles();
  });

  afterAll(() => {
    fakeChrome.wss.close();
    fakeChrome.server.close();
    cleanupFiles();
  });

  it('starts and writes endpoint/pid files', async () => {
    const { proc, proxyEndpoint } = await startProxy(fakeChrome.endpoint);
    proxyProc = proc;

    expect(proxyEndpoint).toMatch(
      /^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser$/,
    );
    expect(existsSync(PROXY_ENDPOINT_FILE)).toBe(true);
    expect(existsSync(PROXY_PID_FILE)).toBe(true);

    const savedEndpoint = readFileSync(PROXY_ENDPOINT_FILE, 'utf-8').trim();
    expect(savedEndpoint).toBe(proxyEndpoint);

    const savedPid = Number(readFileSync(PROXY_PID_FILE, 'utf-8').trim());
    expect(savedPid).toBe(proc.pid);
  });

  it('forwards messages bidirectionally', async () => {
    const { proc, proxyEndpoint } = await startProxy(fakeChrome.endpoint);
    proxyProc = proc;

    // Connect a client to the proxy
    const client = new WebSocket(proxyEndpoint);
    await new Promise<void>((resolve, reject) => {
      client.on('open', resolve);
      client.on('error', reject);
    });

    // Send a CDP message through the proxy
    const response = await new Promise<Record<string, unknown>>((resolve) => {
      client.on('message', (data) => {
        resolve(JSON.parse(data.toString()));
      });
      client.send(JSON.stringify({ id: 1, method: 'Target.getTargets' }));
    });

    expect(response).toHaveProperty('id', 1);
    expect(response).toHaveProperty('result');
    const result = response.result as {
      targetInfos: { type: string; url: string }[];
    };
    expect(result.targetInfos[0].url).toBe('https://test.com');

    client.close();
  });

  it('handles multiple sequential clients', async () => {
    const { proc, proxyEndpoint } = await startProxy(fakeChrome.endpoint);
    proxyProc = proc;

    // First client
    const client1 = new WebSocket(proxyEndpoint);
    await new Promise<void>((r) => client1.on('open', r));
    const res1 = await new Promise<Record<string, unknown>>((r) => {
      client1.on('message', (d) => r(JSON.parse(d.toString())));
      client1.send(JSON.stringify({ id: 10, method: 'test' }));
    });
    expect(res1).toHaveProperty('id', 10);
    client1.close();
    await new Promise((r) => setTimeout(r, 100));

    // Second client (reuses same proxy)
    const client2 = new WebSocket(proxyEndpoint);
    await new Promise<void>((r) => client2.on('open', r));
    const res2 = await new Promise<Record<string, unknown>>((r) => {
      client2.on('message', (d) => r(JSON.parse(d.toString())));
      client2.send(JSON.stringify({ id: 20, method: 'test' }));
    });
    expect(res2).toHaveProperty('id', 20);
    client2.close();
  });

  it('cleans up files on SIGTERM', async () => {
    const { proc, proxyEndpoint } = await startProxy(fakeChrome.endpoint);
    proxyProc = proc;

    expect(existsSync(PROXY_ENDPOINT_FILE)).toBe(true);
    expect(existsSync(PROXY_PID_FILE)).toBe(true);

    proc.kill('SIGTERM');
    await new Promise<void>((resolve) => proc.on('exit', resolve));
    proxyProc = null;

    // Files should be cleaned up
    await new Promise((r) => setTimeout(r, 100));
    expect(existsSync(PROXY_ENDPOINT_FILE)).toBe(false);
    expect(existsSync(PROXY_PID_FILE)).toBe(false);
  });

  it('reconnects upstream when next client connects after all disconnect', async () => {
    const { proc, proxyEndpoint } = await startProxy(fakeChrome.endpoint);
    proxyProc = proc;

    // First client connects, sends a message, then disconnects
    const client1 = new WebSocket(proxyEndpoint);
    await new Promise<void>((r) => client1.on('open', r));
    const res1 = await new Promise<Record<string, unknown>>((r) => {
      client1.on('message', (d) => r(JSON.parse(d.toString())));
      client1.send(JSON.stringify({ id: 1, method: 'test' }));
    });
    expect(res1).toHaveProperty('id', 1);

    client1.close();

    // Wait for the close event to propagate
    await new Promise((r) => setTimeout(r, 200));

    // Upstream reconnect is deferred — it should NOT have happened yet.
    // Chrome should still have only 1 connection (the original).
    expect(fakeChrome.clients.size).toBe(1);

    // Second client connects — this triggers the deferred upstream reconnect
    const client2 = new WebSocket(proxyEndpoint);
    await new Promise<void>((r) => client2.on('open', r));

    // Wait for upstream reconnect to complete
    await new Promise((r) => setTimeout(r, 300));

    // Verify Chrome got a new connection (reconnect happened on new client)
    expect(fakeChrome.clients.size).toBeGreaterThanOrEqual(1);

    const res2 = await new Promise<Record<string, unknown>>((r) => {
      client2.on('message', (d) => r(JSON.parse(d.toString())));
      client2.send(JSON.stringify({ id: 2, method: 'test' }));
    });
    expect(res2).toHaveProperty('id', 2);
    client2.close();

    // Proxy should still be alive
    expect(proc.killed).toBe(false);
  });

  it('buffers client messages during upstream reconnect', async () => {
    const { proc, proxyEndpoint } = await startProxy(fakeChrome.endpoint);
    proxyProc = proc;

    // First client connects and disconnects to mark upstream for reconnect
    const client1 = new WebSocket(proxyEndpoint);
    await new Promise<void>((r) => client1.on('open', r));
    client1.close();

    // Wait for the close event to propagate so the reconnect flag is set
    await new Promise((r) => setTimeout(r, 100));

    // Second client connects — triggers deferred upstream reconnect.
    // The upstream may still be reconnecting when the client sends a message,
    // so the message should be buffered and flushed once upstream opens.
    const client2 = new WebSocket(proxyEndpoint);
    await new Promise<void>((r) => client2.on('open', r));

    // Send a message that may need to be buffered if upstream isn't ready yet
    const res = await new Promise<Record<string, unknown>>((resolve) => {
      client2.on('message', (d) => resolve(JSON.parse(d.toString())));
      client2.send(JSON.stringify({ id: 42, method: 'buffered.test' }));
    });

    expect(res).toHaveProperty('id', 42);
    client2.close();
  });

  it('shuts down when upstream closes', async () => {
    // Create a separate fake Chrome for this test so we can close it
    const isolatedChrome = await createFakeChrome();
    const { proc, proxyEndpoint } = await startProxy(isolatedChrome.endpoint);
    proxyProc = proc;

    // Verify proxy is working
    const client = new WebSocket(proxyEndpoint);
    await new Promise<void>((r) => client.on('open', r));
    client.close();

    // Close fake Chrome — proxy should exit
    const exitPromise = new Promise<number | null>((resolve) =>
      proc.on('exit', (code) => resolve(code)),
    );

    // Close all Chrome-side connections and server
    for (const c of isolatedChrome.clients) c.close();
    isolatedChrome.wss.close();
    isolatedChrome.server.close();

    const exitCode = await exitPromise;
    proxyProc = null;
    expect(exitCode).toBe(0);
  });

  it('writes upstream endpoint file on startup', async () => {
    const { proc } = await startProxy(fakeChrome.endpoint);
    proxyProc = proc;

    expect(existsSync(PROXY_UPSTREAM_FILE)).toBe(true);
    const savedUpstream = readFileSync(PROXY_UPSTREAM_FILE, 'utf-8').trim();
    expect(savedUpstream).toBe(fakeChrome.endpoint);
  });

  it('cleans up upstream file on SIGTERM', async () => {
    const { proc } = await startProxy(fakeChrome.endpoint);
    proxyProc = proc;

    expect(existsSync(PROXY_UPSTREAM_FILE)).toBe(true);

    proc.kill('SIGTERM');
    await new Promise<void>((resolve) => proc.on('exit', resolve));
    proxyProc = null;

    await new Promise((r) => setTimeout(r, 100));
    expect(existsSync(PROXY_UPSTREAM_FILE)).toBe(false);
  });

  it('announces duplicate-proxy detection on stderr before exiting', async () => {
    // Start the first proxy normally.
    const { proc: proc1 } = await startProxy(fakeChrome.endpoint);
    proxyProc = proc1;

    // Spawn a second proxy against the same Chrome while the first is alive.
    // The second should see the existing pid file and exit 0 with a
    // diagnostic line on stderr.
    const second = spawn(
      process.execPath,
      [PROXY_SCRIPT, fakeChrome.endpoint],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let secondStderr = '';
    second.stderr?.on('data', (c: Buffer) => {
      secondStderr += c.toString();
    });

    const exitCode = await new Promise<number | null>((resolve) =>
      second.on('exit', (code) => resolve(code)),
    );
    expect(exitCode).toBe(0);
    expect(secondStderr).toMatch(/duplicate proxy detected/);

    // The first proxy's metadata must still be intact — the second must
    // not have wiped the endpoint/pid files on its way out.
    expect(existsSync(PROXY_PID_FILE)).toBe(true);
    expect(existsSync(PROXY_ENDPOINT_FILE)).toBe(true);
  });

  it('records different upstream for different Chrome endpoints', async () => {
    // Start proxy for first fake Chrome
    const { proc: proc1 } = await startProxy(fakeChrome.endpoint);
    proxyProc = proc1;

    const upstream1 = readFileSync(PROXY_UPSTREAM_FILE, 'utf-8').trim();
    expect(upstream1).toBe(fakeChrome.endpoint);

    // Kill first proxy
    proc1.kill('SIGTERM');
    await new Promise<void>((resolve) => proc1.on('exit', resolve));
    proxyProc = null;
    cleanupFiles();

    // Start a second fake Chrome on a different port
    const fakeChrome2 = await createFakeChrome();

    try {
      const { proc: proc2 } = await startProxy(fakeChrome2.endpoint);
      proxyProc = proc2;

      const upstream2 = readFileSync(PROXY_UPSTREAM_FILE, 'utf-8').trim();
      expect(upstream2).toBe(fakeChrome2.endpoint);
      // The upstream should differ since the fake Chromes are on different ports
      expect(upstream2).not.toBe(upstream1);
    } finally {
      fakeChrome2.wss.close();
      fakeChrome2.server.close();
    }
  });

  it('getProxyEndpoint replaces a live proxy when upstream changes', async () => {
    // This test exercises the real getProxyEndpoint() / killProxy() path.
    // It guards against the bug where an alive proxy connected to Chrome A
    // would be reused for a request targeting Chrome B (#2354) — including
    // the timing window where the old proxy has not finished exiting yet
    // when the new one is spawned.
    //
    // The "records different upstream" test above only covers metadata
    // bookkeeping with manual SIGTERM + cleanupFiles() in between, which
    // hides whether killProxy()'s synchronous unlinks let the next
    // spawnProxy() through without tripping its duplicate-proxy guard.
    const { getProxyEndpoint, isProxyAlive, readProxyUpstream } = await import(
      '../../dist/lib/cdp-proxy-manager.js'
    );

    cleanupFiles();
    try {
      if (existsSync(join(tmpdir(), 'midscene-cdp-target-id'))) {
        unlinkSync(join(tmpdir(), 'midscene-cdp-target-id'));
      }
    } catch {}

    const fakeChromeB = await createFakeChrome();
    let endpointA = '';
    let endpointB = '';
    try {
      endpointA = await getProxyEndpoint(fakeChrome.endpoint);
      expect(endpointA).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser$/);
      expect(readProxyUpstream()).toBe(fakeChrome.endpoint);
      expect(isProxyAlive()).toBe(true);

      // Switching upstream — should kill the old proxy and start a new one.
      // We do NOT cleanupFiles() between calls; the killProxy() path inside
      // getProxyEndpoint() must handle the metadata files itself so that
      // the new spawn does not see a stale PID file and exit early.
      endpointB = await getProxyEndpoint(fakeChromeB.endpoint);
      expect(endpointB).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser$/);
      expect(endpointB).not.toBe(endpointA);
      expect(readProxyUpstream()).toBe(fakeChromeB.endpoint);
      expect(isProxyAlive()).toBe(true);

      // The new proxy must actually accept downstream connections —
      // i.e. spawnProxy() did not silently fall back to returning the raw
      // Chrome endpoint after the duplicate-proxy guard fired.
      const ws = new WebSocket(endpointB);
      await new Promise<void>((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
      });
      ws.close();
    } finally {
      // Tear down the live proxy we created via getProxyEndpoint.
      if (existsSync(PROXY_PID_FILE)) {
        try {
          const pid = Number(readFileSync(PROXY_PID_FILE, 'utf-8').trim());
          process.kill(pid, 'SIGTERM');
          await new Promise((r) => setTimeout(r, 200));
        } catch {}
      }
      cleanupFiles();
      fakeChromeB.wss.close();
      fakeChromeB.server.close();
    }
  });
});
