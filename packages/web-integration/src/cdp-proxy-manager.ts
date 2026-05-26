/**
 * CDP proxy lifecycle manager (parent-side).
 *
 * Owns everything the CLI needs to start, locate, replace and kill the
 * standalone `cdp-proxy.ts` child process — including its on-disk
 * metadata files (PROXY_ENDPOINT_FILE / PROXY_PID_FILE /
 * PROXY_UPSTREAM_FILE). Also handles auto-resolving page-level CDP URLs
 * to browser-level endpoints via `/json/version`, since puppeteer-core
 * cannot connect to page-level URLs directly.
 *
 * Other modules (notably `mcp-tools-cdp.ts`) use this through the
 * `getProxyEndpoint()` entry point and never touch the metadata files
 * themselves. The cross-command targetId is a separate concern owned by
 * `cdp-target-store.ts`.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { getDebug } from '@midscene/shared/logger';
import {
  PROXY_ENDPOINT_FILE,
  PROXY_PID_FILE,
  PROXY_UPSTREAM_FILE,
} from './cdp-proxy-constants';
import { cleanupTargetIdFile } from './cdp-target-store';

const debug = getDebug('mcp:cdp:proxy');

/** Time to wait for the proxy to exit on SIGTERM before resorting to SIGKILL. */
const PROXY_TERM_GRACE_MS = 2000;

/** Polling interval while waiting for the proxy's PID file to disappear. */
const PROXY_TERM_POLL_MS = 50;

/** Keep at most this many bytes of proxy stderr for diagnostics. */
const PROXY_STDERR_BUFFER_LIMIT = 8 * 1024;

/** How long `spawnProxy()` waits for the child to print its endpoint. */
const PROXY_STARTUP_TIMEOUT_MS = 10_000;

/**
 * Page-level CDP URLs (`/devtools/page/<id>`) cannot be passed to
 * `puppeteer.connect()` — puppeteer needs a browser-level endpoint.
 */
function isPageLevelEndpoint(endpoint: string): boolean {
  return /\/devtools\/page\//.test(endpoint);
}

/**
 * Resolve a page-level CDP URL to its browser-level WebSocket URL by
 * fetching `/json/version` from the same host:port.
 */
function resolveBrowserEndpoint(pageEndpoint: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let host: string;
    try {
      const url = new URL(pageEndpoint);
      host = url.host; // includes port (e.g. "127.0.0.1:9222")
    } catch {
      reject(new Error(`Invalid CDP endpoint URL: ${pageEndpoint}`));
      return;
    }

    const req = http.get(
      `http://${host}/json/version`,
      { timeout: 5000 },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`/json/version returned HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          try {
            const info = JSON.parse(data);
            if (info.webSocketDebuggerUrl) {
              resolve(info.webSocketDebuggerUrl);
            } else {
              reject(
                new Error(
                  'webSocketDebuggerUrl not found in /json/version response',
                ),
              );
            }
          } catch {
            reject(
              new Error(`Failed to parse /json/version response: ${data}`),
            );
          }
        });
      },
    );
    req.on('error', (err) =>
      reject(new Error(`Failed to fetch /json/version: ${err.message}`)),
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout fetching /json/version'));
    });
  });
}

/**
 * True if the previously spawned proxy process is still running.
 */
export function isProxyAlive(): boolean {
  if (!existsSync(PROXY_PID_FILE)) return false;
  try {
    const pid = Number(readFileSync(PROXY_PID_FILE, 'utf-8').trim());
    process.kill(pid, 0); // signal 0 = existence check
    return true;
  } catch {
    return false;
  }
}

/**
 * The local WebSocket URL the running proxy is serving, or null.
 */
export function readProxyEndpoint(): string | null {
  if (!existsSync(PROXY_ENDPOINT_FILE)) return null;
  try {
    return readFileSync(PROXY_ENDPOINT_FILE, 'utf-8').trim();
  } catch {
    return null;
  }
}

/**
 * The Chrome endpoint the running proxy is connected to, or null.
 */
export function readProxyUpstream(): string | null {
  if (!existsSync(PROXY_UPSTREAM_FILE)) return null;
  try {
    return readFileSync(PROXY_UPSTREAM_FILE, 'utf-8').trim();
  } catch {
    return null;
  }
}

/**
 * Best-effort sweep of proxy metadata files. Only used as a fallback
 * when the proxy fails to exit and run its own `cleanupIfOwned()`. In
 * the happy path the child owns these files and removes them itself.
 */
function sweepProxyMetadataFiles(): void {
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
 * Stop the running proxy and discard the cross-command targetId.
 *
 * Sends SIGTERM and waits for the proxy's own SIGTERM handler to remove
 * its PROXY_*_FILE metadata via `cleanupIfOwned()`. When the PID file
 * disappears we know the next `spawnProxy()` can safely take over
 * without tripping the duplicate-proxy guard. Falls back to SIGKILL +
 * manual sweep if the proxy is unresponsive within `PROXY_TERM_GRACE_MS`.
 *
 * The targetId file is cleared regardless of the proxy's state because
 * it points into the outgoing Chrome's tab list.
 */
export async function killProxy(): Promise<void> {
  cleanupTargetIdFile();

  if (!existsSync(PROXY_PID_FILE)) return;

  let pid: number;
  try {
    pid = Number(readFileSync(PROXY_PID_FILE, 'utf-8').trim());
    if (!Number.isFinite(pid)) {
      sweepProxyMetadataFiles();
      return;
    }
  } catch (err) {
    debug('killProxy: cannot read pid file: %s', err);
    sweepProxyMetadataFiles();
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    debug('Sent SIGTERM to proxy pid %d', pid);
  } catch (err) {
    // ESRCH (already dead) is the common case; surface anything else
    // (e.g. EPERM) via debug so it does not vanish silently. Either way
    // sweep the orphan metadata so the next spawn has a clean slate.
    debug('killProxy: SIGTERM failed (pid %d): %s', pid, err);
    sweepProxyMetadataFiles();
    return;
  }

  const deadline = Date.now() + PROXY_TERM_GRACE_MS;
  while (Date.now() < deadline && existsSync(PROXY_PID_FILE)) {
    await new Promise((r) => setTimeout(r, PROXY_TERM_POLL_MS));
  }

  if (existsSync(PROXY_PID_FILE)) {
    debug(
      'proxy pid %d did not clean up within %dms, forcing SIGKILL',
      pid,
      PROXY_TERM_GRACE_MS,
    );
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
    sweepProxyMetadataFiles();
  }
}

/**
 * Spawn the CDP proxy process and wait for it to print the endpoint.
 *
 * Captures the child's stderr so that when startup fails we can surface
 * the real reason (upstream closed / duplicate proxy / upstream error)
 * instead of the generic "exited before ready".
 */
function spawnProxy(chromeEndpoint: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proxyScript = join(__dirname, 'cdp-proxy.js');
    const proc = spawn(process.execPath, [proxyScript, chromeEndpoint], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.unref();

    let output = '';
    let stderrBuf = '';
    let settled = false;

    const appendStderr = (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      if (stderrBuf.length > PROXY_STDERR_BUFFER_LIMIT) {
        stderrBuf = stderrBuf.slice(-PROXY_STDERR_BUFFER_LIMIT);
      }
    };
    proc.stderr!.on('data', appendStderr);

    const formatStderr = () => {
      const trimmed = stderrBuf.trim();
      return trimmed ? ` (stderr: ${trimmed})` : '';
    };

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(
          new Error(
            `Proxy startup timeout (${PROXY_STARTUP_TIMEOUT_MS / 1000}s)${formatStderr()}`,
          ),
        );
      }
    }, PROXY_STARTUP_TIMEOUT_MS);

    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const lines = output.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.endpoint && !settled) {
            settled = true;
            clearTimeout(timer);
            proc.stdout!.removeListener('data', onData);
            proc.stderr!.removeListener('data', appendStderr);
            // Destroy the stdio pipes so they don't keep the parent
            // process event loop alive after we've read the endpoint.
            proc.stdout!.destroy();
            proc.stderr!.destroy();
            resolve(parsed.endpoint);
            return;
          }
        } catch {
          // stdout may contain non-JSON lines during startup — skip them
        }
      }
    };
    proc.stdout!.on('data', onData);

    proc.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Failed to spawn proxy: ${err.message}`));
      }
    });
    proc.on('exit', (code, signal) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        const how = signal ? `signal ${signal}` : `code ${code}`;
        reject(
          new Error(`Proxy exited with ${how} before ready${formatStderr()}`),
        );
      }
    });
  });
}

/**
 * Resolve the proxy endpoint to use for the given Chrome endpoint.
 *
 * - Page-level URLs are auto-resolved to browser-level via /json/version.
 * - If a proxy is already running and connected to the same upstream,
 *   reuse it.
 * - If a proxy is running but pointed at a different upstream, kill it
 *   and start a fresh one.
 * - If spawning the proxy fails, fall back to the raw Chrome endpoint
 *   (the caller will hit Chrome's permission popup directly but at
 *   least the command does not fail outright).
 */
export async function getProxyEndpoint(
  chromeEndpoint: string,
): Promise<string> {
  let browserEndpoint = chromeEndpoint;
  if (isPageLevelEndpoint(chromeEndpoint)) {
    debug(
      'Page-level CDP endpoint detected, resolving via /json/version: %s',
      chromeEndpoint,
    );
    try {
      browserEndpoint = await resolveBrowserEndpoint(chromeEndpoint);
      debug('Resolved browser endpoint: %s', browserEndpoint);
    } catch (err) {
      throw new Error(
        `Cannot use page-level CDP endpoint directly. Puppeteer requires a browser-level endpoint (e.g., ws://host:port/devtools/browser/<id>). Auto-resolution via /json/version failed: ${(err as Error).message}. Please provide a browser-level CDP endpoint instead.`,
      );
    }
  }

  if (isProxyAlive()) {
    const endpoint = readProxyEndpoint();
    const savedUpstream = readProxyUpstream();
    if (endpoint) {
      if (savedUpstream && savedUpstream !== browserEndpoint) {
        debug(
          'Proxy connected to different upstream (%s), killing',
          savedUpstream,
        );
        await killProxy();
      } else {
        return endpoint;
      }
    }
  }

  try {
    return await spawnProxy(browserEndpoint);
  } catch (err) {
    console.warn(
      `[cdp] proxy failed, falling back to direct connection: ${err}`,
    );
    return browserEndpoint;
  }
}
