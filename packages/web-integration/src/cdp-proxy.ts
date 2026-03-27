/**
 * CDP WebSocket Proxy — standalone process.
 *
 * Holds a single persistent WebSocket connection to Chrome's CDP endpoint and
 * exposes a local WebSocket server. Midscene CLI processes connect to the proxy
 * instead of Chrome directly, so Chrome's "Allow remote debugging" permission
 * popup only fires once (when the proxy connects).
 *
 * Exit conditions:
 *  1. Upstream Chrome connection closes or errors.
 *  2. No downstream client message for IDLE_TIMEOUT_MS (default 5 min).
 *  3. SIGTERM / SIGINT.
 *
 * Usage (spawned by mcp-tools-cdp.ts):
 *   node cdp-proxy.js <chrome-ws-endpoint>
 *
 * On startup, prints the proxy endpoint to stdout as a single JSON line:
 *   {"endpoint":"ws://127.0.0.1:<port>/devtools/browser"}
 * and writes the same endpoint to PROXY_ENDPOINT_FILE.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { PROXY_ENDPOINT_FILE, PROXY_PID_FILE } from './cdp-proxy-constants';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const chromeEndpoint = process.argv[2];
if (!chromeEndpoint) {
  process.stderr.write('Usage: node cdp-proxy.js <chrome-ws-endpoint>\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

function cleanupIfOwned() {
  try {
    if (existsSync(PROXY_PID_FILE)) {
      const pid = Number(readFileSync(PROXY_PID_FILE, 'utf-8').trim());
      if (pid !== process.pid) return;
    }
  } catch {}
  try {
    if (existsSync(PROXY_ENDPOINT_FILE)) unlinkSync(PROXY_ENDPOINT_FILE);
  } catch {}
  try {
    if (existsSync(PROXY_PID_FILE)) unlinkSync(PROXY_PID_FILE);
  } catch {}
}

function shutdown(reason: string) {
  process.stderr.write(`[cdp-proxy] shutting down: ${reason}\n`);
  cleanupIfOwned();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (e) => shutdown(`uncaught: ${e.message}`));

// ---------------------------------------------------------------------------
// Idle timer
// ---------------------------------------------------------------------------

let idleTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(
    () => shutdown('idle timeout (5min)'),
    IDLE_TIMEOUT_MS,
  );
}

resetIdleTimer();

// ---------------------------------------------------------------------------
// Upstream: connect to Chrome
// ---------------------------------------------------------------------------

const upstream = new WebSocket(chromeEndpoint);
const clients = new Set<WebSocket>();

upstream.on('error', (err) => shutdown(`upstream error: ${err.message}`));
upstream.on('close', () => shutdown('upstream closed'));

// Forward upstream messages to all downstream clients
upstream.on('message', (data, isBinary) => {
  resetIdleTimer();
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data, { binary: isBinary });
    }
  }
});

// ---------------------------------------------------------------------------
// Downstream: local WebSocket server
// ---------------------------------------------------------------------------

const httpServer = createServer((_req, res) => {
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (clientWs) => {
  clients.add(clientWs);
  resetIdleTimer();

  // Forward downstream messages to upstream
  clientWs.on('message', (data, isBinary) => {
    resetIdleTimer();
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
    }
  });

  clientWs.on('close', () => clients.delete(clientWs));
  clientWs.on('error', () => clients.delete(clientWs));
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

upstream.on('open', () => {
  // Check for duplicate proxy
  if (existsSync(PROXY_PID_FILE)) {
    try {
      const existingPid = Number(readFileSync(PROXY_PID_FILE, 'utf-8').trim());
      if (existingPid !== process.pid) {
        try {
          process.kill(existingPid, 0);
          process.exit(0); // another proxy is alive
        } catch {
          // dead — we take over
        }
      }
    } catch {}
  }

  httpServer.listen(0, '127.0.0.1', () => {
    const addr = httpServer.address();
    if (!addr || typeof addr === 'string') {
      shutdown('failed to get server address');
      return;
    }

    const proxyEndpoint = `ws://127.0.0.1:${addr.port}/devtools/browser`;

    writeFileSync(PROXY_ENDPOINT_FILE, proxyEndpoint);
    writeFileSync(PROXY_PID_FILE, String(process.pid));

    process.stdout.write(`${JSON.stringify({ endpoint: proxyEndpoint })}\n`);
  });
});
