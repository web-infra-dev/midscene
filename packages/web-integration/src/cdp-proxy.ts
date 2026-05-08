/**
 * CDP WebSocket Proxy — standalone process.
 *
 * Holds a persistent WebSocket connection to Chrome's CDP endpoint and
 * exposes a local WebSocket server. Midscene CLI processes connect to the
 * proxy instead of Chrome directly, so Chrome's "Allow remote debugging"
 * permission popup only fires once (when the proxy connects).
 *
 * Lifecycle notes:
 *  - When all downstream clients disconnect the proxy stays running but
 *    marks the upstream as needing reconnection. The actual reconnect is
 *    deferred to the moment the next client connects, so Chrome's CDP
 *    state (notably Target.setDiscoverTargets) is reset and the new
 *    client receives all targetCreated events.
 *  - On startup, if another proxy is already alive the new instance
 *    announces "duplicate proxy detected" on stderr and exits 0 without
 *    touching the existing metadata files.
 *
 * Exit conditions:
 *  1. Upstream Chrome connection closes or errors.
 *  2. No downstream client message for IDLE_TIMEOUT_MS (default 5 min).
 *  3. SIGTERM / SIGINT.
 *  4. Duplicate proxy detected on startup (exits 0 with stderr notice).
 *
 * Usage (spawned by mcp-tools-cdp.ts):
 *   node cdp-proxy.js <chrome-ws-endpoint>
 *
 * On startup, prints the proxy endpoint to stdout as a single JSON line:
 *   {"endpoint":"ws://127.0.0.1:<port>/devtools/browser"}
 * and writes:
 *   - PROXY_ENDPOINT_FILE — the local proxy URL above
 *   - PROXY_PID_FILE      — this process's pid
 *   - PROXY_UPSTREAM_FILE — the Chrome endpoint the proxy is connected to,
 *                           so callers can detect when the requested
 *                           upstream has changed and replace the proxy.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import {
  PROXY_ENDPOINT_FILE,
  PROXY_PID_FILE,
  PROXY_UPSTREAM_FILE,
} from './cdp-proxy-constants';

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
  // Only clean up if the PID file exists and records *our* PID.
  // If the file is missing (e.g. already deleted by killProxy()) or
  // unreadable, skip cleanup — another process may have taken over.
  try {
    if (!existsSync(PROXY_PID_FILE)) return;
    const pid = Number(readFileSync(PROXY_PID_FILE, 'utf-8').trim());
    if (pid !== process.pid) return;
  } catch {
    return;
  }
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

/**
 * Maximum time to wait for the stderr drain callback before forcing exit.
 * The callback should normally fire within microseconds, but if the pipe
 * has been closed by the parent it may never run. 500ms is generous
 * enough to be effectively unreachable in the happy path while still
 * keeping the process from hanging if something goes wrong.
 */
const STDERR_FLUSH_FALLBACK_MS = 500;

/**
 * Exit after the stderr diagnostic has been flushed.
 *
 * When the proxy's stderr is a pipe (parent uses stdio 'pipe'), Node's
 * process.stderr.write() is asynchronous on POSIX. Calling process.exit()
 * immediately afterwards can drop the pending write, which would silently
 * lose the very diagnostic the caller is relying on. Wait for the drain
 * callback before exiting, with a short fallback timer in case the
 * callback never fires (e.g. the pipe is already closed).
 */
function exitWithStderr(message: string, code = 0): void {
  let exited = false;
  const doExit = () => {
    if (exited) return;
    exited = true;
    process.exit(code);
  };
  const fallback = setTimeout(doExit, STDERR_FLUSH_FALLBACK_MS);
  fallback.unref?.();
  try {
    process.stderr.write(message, () => doExit());
  } catch {
    doExit();
  }
}

function shutdown(reason: string): void {
  cleanupIfOwned();
  exitWithStderr(`[cdp-proxy] shutting down: ${reason}\n`, 0);
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

const clients = new Set<WebSocket>();

/**
 * Whether we are intentionally reconnecting the upstream WebSocket.
 * When true, the old upstream's close/error events should not trigger shutdown.
 */
let reconnecting = false;

/**
 * Whether the upstream WebSocket needs to be reconnected before the next
 * client can use it.  Set to true when all downstream clients disconnect;
 * the actual reconnect is deferred until a new client connects so that
 * Chrome's permission popup only fires when someone actually needs it.
 */
let needsUpstreamReconnect = false;

/**
 * Messages from downstream clients that arrived while the upstream WebSocket
 * was not yet open (e.g. during a reconnect). Flushed once upstream opens.
 */
const pendingUpstreamMessages: {
  data: WebSocket.RawData;
  isBinary: boolean;
}[] = [];

/**
 * Create a new upstream WebSocket to Chrome and bind its event handlers.
 * Used for both initial connection and reconnection.
 */
function createUpstream(endpoint: string): WebSocket {
  const ws = new WebSocket(endpoint);

  ws.on('error', (err) => {
    // A failed reconnect must not leave the flag stuck on.
    reconnecting = false;
    shutdown(`upstream error: ${err.message}`);
  });

  ws.on('close', (code, reasonBuf) => {
    if (reconnecting) return;
    const reason = reasonBuf?.toString?.() || '';
    const detail = reason
      ? ` (code=${code}, reason=${reason})`
      : ` (code=${code})`;
    shutdown(`upstream closed${detail}`);
  });

  // Forward upstream messages to all downstream clients
  ws.on('message', (data, isBinary) => {
    resetIdleTimer();
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data, { binary: isBinary });
      }
    }
  });

  ws.on('open', () => {
    reconnecting = false;
    for (const msg of pendingUpstreamMessages) {
      ws.send(msg.data, { binary: msg.isBinary });
    }
    pendingUpstreamMessages.length = 0;
  });

  return ws;
}

let upstream = createUpstream(chromeEndpoint);

/**
 * Reconnect the upstream WebSocket to Chrome.
 *
 * Called when all downstream clients have disconnected. This resets the CDP
 * protocol state on Chrome's side — critically, the Target.setDiscoverTargets
 * subscription — so the next client that connects gets a fresh session and
 * receives all targetCreated events.
 *
 * `reconnecting` is cleared by the new upstream's `open` (or `error`) handler,
 * not here — the new socket is still CONNECTING when this returns.
 */
function reconnectUpstream() {
  reconnecting = true;
  upstream.removeAllListeners();
  upstream.close();
  upstream = createUpstream(chromeEndpoint);
  resetIdleTimer();
}

// ---------------------------------------------------------------------------
// Downstream: local WebSocket server
// ---------------------------------------------------------------------------

const httpServer = createServer((_req, res) => {
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (clientWs) => {
  // Reconnect the upstream WebSocket if the previous session ended.
  // This resets Chrome's CDP protocol state (Target.setDiscoverTargets, etc.)
  // so the new client receives all targetCreated events.
  if (needsUpstreamReconnect && upstream.readyState === WebSocket.OPEN) {
    reconnectUpstream();
    needsUpstreamReconnect = false;
  }

  clients.add(clientWs);
  resetIdleTimer();

  // Forward downstream messages to upstream (buffer if upstream is reconnecting)
  clientWs.on('message', (data, isBinary) => {
    resetIdleTimer();
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
    } else {
      pendingUpstreamMessages.push({ data, isBinary });
    }
  });

  const removeClient = () => {
    clients.delete(clientWs);
    // When all downstream clients disconnect, mark that the upstream needs
    // reconnecting to reset Chrome's CDP protocol state.  The actual
    // reconnect is deferred until the next client connects so we don't
    // trigger Chrome's permission popup while nobody is using the proxy.
    if (clients.size === 0) {
      pendingUpstreamMessages.length = 0;
      needsUpstreamReconnect = true;
    }
  };

  clientWs.on('close', removeClient);
  clientWs.on('error', removeClient);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

// Start the HTTP/WebSocket server once the initial upstream connection opens.
// This listener is added *after* createUpstream() already bound its own 'open'
// handler (which flushes pendingUpstreamMessages), so both will fire.
upstream.once('open', () => {
  // Check for duplicate proxy
  if (existsSync(PROXY_PID_FILE)) {
    try {
      const existingPid = Number(readFileSync(PROXY_PID_FILE, 'utf-8').trim());
      if (existingPid !== process.pid) {
        try {
          process.kill(existingPid, 0);
          // Another proxy is alive — exit without cleanupIfOwned() (we don't
          // own the metadata files). Announce the reason on stderr so the
          // parent process can distinguish this path from upstream failures,
          // then bail out of this open handler so we don't proceed to listen().
          exitWithStderr(
            `[cdp-proxy] duplicate proxy detected (existing pid=${existingPid})\n`,
            0,
          );
          return;
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
    writeFileSync(PROXY_UPSTREAM_FILE, chromeEndpoint);

    process.stdout.write(`${JSON.stringify({ endpoint: proxyEndpoint })}\n`);
  });
});
