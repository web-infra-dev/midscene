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
 *
 * Implementation uses only Node.js built-ins (no `ws` dependency).
 */

import { createHash } from 'node:crypto';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { type IncomingMessage, createServer } from 'node:http';
import { type Socket, connect as netConnect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const PROXY_ENDPOINT_FILE = join(tmpdir(), 'midscene-cdp-proxy-endpoint');
const PROXY_PID_FILE = join(tmpdir(), 'midscene-cdp-proxy-pid');

const chromeEndpoint = process.argv[2];
if (!chromeEndpoint) {
  process.stderr.write('Usage: node cdp-proxy.js <chrome-ws-endpoint>\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Cleanup helper
// ---------------------------------------------------------------------------

function cleanup() {
  try {
    if (existsSync(PROXY_ENDPOINT_FILE)) unlinkSync(PROXY_ENDPOINT_FILE);
  } catch {}
  try {
    if (existsSync(PROXY_PID_FILE)) unlinkSync(PROXY_PID_FILE);
  } catch {}
}

function shutdown(reason: string) {
  process.stderr.write(`[cdp-proxy] shutting down: ${reason}\n`);
  cleanup();
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
// Minimal WebSocket frame helpers (RFC 6455)
// ---------------------------------------------------------------------------

function encodeFrame(data: Buffer, opcode = 0x01, mask = false): Buffer {
  const len = data.length;
  let headerLen = 2;
  if (len > 65535) headerLen += 8;
  else if (len > 125) headerLen += 2;
  if (mask) headerLen += 4;

  const header = Buffer.alloc(headerLen);
  header[0] = 0x80 | opcode; // FIN + opcode
  let offset = 1;

  if (len > 65535) {
    header[offset++] = (mask ? 0x80 : 0) | 127;
    header.writeBigUInt64BE(BigInt(len), offset);
    offset += 8;
  } else if (len > 125) {
    header[offset++] = (mask ? 0x80 : 0) | 126;
    header.writeUInt16BE(len, offset);
    offset += 2;
  } else {
    header[offset++] = (mask ? 0x80 : 0) | len;
  }

  if (mask) {
    const maskBytes = Buffer.from([
      Math.random() * 256,
      Math.random() * 256,
      Math.random() * 256,
      Math.random() * 256,
    ]);
    maskBytes.copy(header, offset);
    const masked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) masked[i] = data[i] ^ maskBytes[i & 3];
    return Buffer.concat([header, masked]);
  }

  return Buffer.concat([header, data]);
}

interface ParsedFrame {
  opcode: number;
  payload: Buffer;
  total: number;
}

function parseFrame(buf: Buffer): ParsedFrame | null {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const isMasked = (buf[1] & 0x80) !== 0;
  let payloadLen = buf[1] & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buf.length < 10) return null;
    payloadLen = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }

  if (isMasked) offset += 4;
  if (buf.length < offset + payloadLen) return null;

  let payload: Buffer;
  if (isMasked) {
    const maskKey = buf.subarray(offset - 4, offset);
    payload = Buffer.alloc(payloadLen);
    for (let i = 0; i < payloadLen; i++)
      payload[i] = buf[offset + i] ^ maskKey[i & 3];
  } else {
    payload = buf.subarray(offset, offset + payloadLen);
  }

  return { opcode, payload, total: offset + payloadLen };
}

// ---------------------------------------------------------------------------
// Upstream: connect to Chrome via raw TCP + WebSocket handshake
// ---------------------------------------------------------------------------

const chromeUrl = new URL(chromeEndpoint);
const chromeHost = chromeUrl.hostname;
const chromePort = Number(chromeUrl.port) || 80;
const chromePath = chromeUrl.pathname || '/devtools/browser';

let upstream: Socket;
let upstreamReady = false;
let upstreamBuf = Buffer.alloc(0);

// Track all downstream client sockets
const clients = new Set<Socket>();

function connectUpstream() {
  upstream = netConnect({ host: chromeHost, port: chromePort }, () => {
    // Send WebSocket upgrade request
    const key = createHash('sha1')
      .update(String(Date.now()))
      .digest('base64')
      .substring(0, 22);
    const req = [
      `GET ${chromePath} HTTP/1.1`,
      `Host: ${chromeHost}:${chromePort}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Version: 13',
      `Sec-WebSocket-Key: ${key}`,
      '',
      '',
    ].join('\r\n');
    upstream.write(req);
  });

  upstream.on('data', (chunk: Buffer) => {
    upstreamBuf = Buffer.concat([upstreamBuf, chunk]);

    if (!upstreamReady) {
      const idx = upstreamBuf.indexOf('\r\n\r\n');
      if (idx === -1) return;
      const headers = upstreamBuf.subarray(0, idx).toString();
      if (!headers.includes('101')) {
        shutdown(`upstream handshake failed: ${headers.split('\r\n')[0]}`);
        return;
      }
      upstreamReady = true;
      upstreamBuf = upstreamBuf.subarray(idx + 4);
      onUpstreamReady();
    }

    // Parse and forward frames to all downstream clients
    while (upstreamBuf.length > 0) {
      const frame = parseFrame(upstreamBuf);
      if (!frame) break;

      if (frame.opcode === 0x08) {
        // Close frame
        shutdown('upstream sent close frame');
        return;
      }

      resetIdleTimer();

      // Re-encode as unmasked server frame and send to all clients
      const outFrame = encodeFrame(frame.payload, frame.opcode, false);
      for (const client of clients) {
        if (!client.destroyed) client.write(outFrame);
      }

      upstreamBuf = upstreamBuf.subarray(frame.total);
    }
  });

  upstream.on('error', (err) => shutdown(`upstream error: ${err.message}`));
  upstream.on('close', () => shutdown('upstream closed'));
}

// ---------------------------------------------------------------------------
// Downstream: HTTP server that upgrades to WebSocket
// ---------------------------------------------------------------------------

const httpServer = createServer((_req, res) => {
  res.writeHead(404);
  res.end();
});

httpServer.on(
  'upgrade',
  (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    // Complete WebSocket handshake
    const accept = createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-5AB5DC085B63`)
      .digest('base64');
    socket.write(
      [
        'HTTP/1.1 101 WebSocket Protocol Handshake',
        'Upgrade: WebSocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '',
        '',
      ].join('\r\n'),
    );

    clients.add(socket);
    resetIdleTimer();

    let clientBuf = Buffer.from(head);

    socket.on('data', (chunk: Buffer) => {
      clientBuf = Buffer.concat([clientBuf, chunk]);

      while (clientBuf.length > 0) {
        const frame = parseFrame(clientBuf);
        if (!frame) break;

        if (frame.opcode === 0x08) {
          // Close frame from client
          clients.delete(socket);
          socket.destroy();
          return;
        }

        resetIdleTimer();

        // Re-encode as masked client frame and send upstream
        const outFrame = encodeFrame(frame.payload, frame.opcode, true);
        if (!upstream.destroyed) upstream.write(outFrame);

        clientBuf = clientBuf.subarray(frame.total);
      }
    });

    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

function onUpstreamReady() {
  httpServer.listen(0, '127.0.0.1', () => {
    const addr = httpServer.address();
    if (!addr || typeof addr === 'string') {
      shutdown('failed to get server address');
      return;
    }

    const proxyEndpoint = `ws://127.0.0.1:${addr.port}/devtools/browser`;

    writeFileSync(PROXY_ENDPOINT_FILE, proxyEndpoint);
    writeFileSync(PROXY_PID_FILE, String(process.pid));

    // Print to stdout so the spawner can read it
    process.stdout.write(`${JSON.stringify({ endpoint: proxyEndpoint })}\n`);
  });
}

connectUpstream();
