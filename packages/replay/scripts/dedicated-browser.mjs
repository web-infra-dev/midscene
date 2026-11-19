import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';
import { startUrl } from './browser.mjs';

const open = promisify(execFile);
const apps = new Map([
  ['chrome', 'Google Chrome'],
  ['msedge', 'Microsoft Edge'],
]);

async function checkPort(port) {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  }).catch((cause) => {
    if (cause.code !== 'EADDRINUSE') throw cause;
    throw new Error(
      `CDP_PORT_IN_USE: ${port}. If the dedicated Replay window is already running, use its existing endpoint. Otherwise choose an unused --port.`,
      { cause },
    );
  });
}

export async function openDedicatedBrowser(
  engine,
  {
    port = '9222',
    url,
    profileRoot = join(
      homedir(),
      'Library',
      'Application Support',
      'Midscene Replay',
    ),
  } = {},
) {
  const app = apps.get(engine);
  if (!app) throw new Error('browser expects chrome or msedge');
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error('--port expects an integer between 1 and 65535');
  const start = url === undefined ? undefined : startUrl(url);
  if (process.platform !== 'darwin')
    throw new Error(
      'The dedicated browser launcher requires macOS. Start a dedicated browser manually and pass its local endpoint to --cdp.',
    );

  const portNumber = Number(port);
  const endpoint = `http://127.0.0.1:${portNumber}`;
  const profile = join(profileRoot, engine);
  await checkPort(portNumber);
  await mkdir(profile, { recursive: true, mode: 0o700 });
  try {
    await open('/usr/bin/open', [
      '-na',
      app,
      '--args',
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${portNumber}`,
      '--no-first-run',
      '--no-default-browser-check',
      ...(start ? [start] : []),
    ]);
  } catch (cause) {
    throw new Error(
      `CDP_BROWSER_LAUNCH_FAILED: Could not open ${app}. Check that it is installed.`,
      { cause },
    );
  }

  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/json/version`, {
        redirect: 'error',
        signal: AbortSignal.timeout(500),
      });
      const { webSocketDebuggerUrl } = await response.json();
      if (
        response.ok &&
        webSocketDebuggerUrl?.startsWith(
          `ws://127.0.0.1:${portNumber}/devtools/browser/`,
        )
      )
        return { browser: engine, endpoint, profile };
    } catch {
      // The browser process may still be starting.
    }
    await setTimeout(150);
  }
  throw new Error(
    `CDP_BROWSER_NOT_READY: ${endpoint} did not become ready. Check whether the dedicated window is already running on another port or browser policy blocks remote debugging.`,
  );
}
