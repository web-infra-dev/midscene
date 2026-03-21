/**
 * E2E test for Chrome extension Bridge Mode start/stop controls.
 *
 * Verifies the fix for https://github.com/web-infra-dev/midscene/issues/2119:
 * - Bridge mode can connect to a real BridgeServer → UI shows "Connected"
 * - Clicking Stop disconnects → UI shows "Stopped"
 * - After stopping, a new BridgeServer gets no connection
 * - Clicking Start re-enables listening and can connect again
 *
 * This test launches Chrome with the extension and starts real bridge
 * servers (via child process) to verify actual WebSocket connections.
 */
import { type ChildProcess, execSync, spawn } from 'node:child_process';
import path from 'node:path';
import { sleep } from '@midscene/core/utils';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ComputerAgent, agentFromComputer } from '../../src';
import {
  findExtensionPageTarget,
  injectBridgePermission,
  injectExtensionConfig,
  launchChromeWithExtension,
  readExtensionId,
  reloadViaWebSocket,
} from './chrome-extension-helpers';

vi.setConfig({ testTimeout: 360 * 1000 });

const SIDE_PANEL =
  'the Midscene side panel on the right side of the browser window';
const BRIDGE_PORT = 3766;
const SERVER_SCRIPT = path.resolve(
  __dirname,
  '../../../web-integration/tests/bridge-test-server.mjs',
);
const WEB_INTEGRATION_DIR = path.resolve(__dirname, '../../../web-integration');

/**
 * Start a bridge test server as a child process.
 * Returns the process and a promise-based API for waiting on events.
 */
/**
 * Kill any process occupying the given port before starting a new server.
 */
function killPortProcess(port: number): void {
  try {
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
      stdio: 'ignore',
    });
  } catch {
    // Ignore - no process on port
  }
}

/**
 * Start a bridge test server as a child process.
 * Cleans up the port first, waits for LISTENING before returning.
 */
async function startBridgeServer(port = BRIDGE_PORT): Promise<{
  proc: ChildProcess;
  waitForConnected: (timeoutMs?: number) => Promise<boolean>;
  waitForDisconnected: (timeoutMs?: number) => Promise<boolean>;
  kill: () => Promise<void>;
}> {
  // Clean up any leftover process on the port
  killPortProcess(port);
  await sleep(500);

  const proc = spawn('node', [SERVER_SCRIPT, String(port)], {
    cwd: WEB_INTEGRATION_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const events: string[] = [];

  proc.stdout?.on('data', (data: Buffer) => {
    const line = data.toString().trim();
    console.log(`[BridgeServer] ${line}`);
    events.push(line);
  });

  proc.stderr?.on('data', (data: Buffer) => {
    console.error(`[BridgeServer stderr] ${data.toString().trim()}`);
  });

  const waitForEvent = (event: string, timeoutMs = 15000): Promise<boolean> => {
    return new Promise((resolve) => {
      if (events.some((e) => e.includes(event))) {
        resolve(true);
        return;
      }

      const onData = (data: Buffer) => {
        if (data.toString().includes(event)) {
          clearTimeout(timer);
          proc.stdout?.off('data', onData);
          resolve(true);
        }
      };

      const timer = setTimeout(() => {
        proc.stdout?.off('data', onData);
        resolve(false);
      }, timeoutMs);

      proc.stdout?.on('data', onData);
    });
  };

  // Wait for server to be ready before returning
  const listening = await waitForEvent('LISTENING', 10000);
  if (!listening) {
    proc.kill('SIGKILL');
    throw new Error(`Bridge server failed to start on port ${port}`);
  }

  return {
    proc,
    waitForConnected: (timeoutMs?: number) =>
      waitForEvent('CONNECTED', timeoutMs),
    waitForDisconnected: (timeoutMs?: number) =>
      waitForEvent('DISCONNECTED', timeoutMs),
    kill: async () => {
      proc.kill('SIGTERM');
      // Wait for process to exit and port to be released
      await new Promise<void>((resolve) => {
        proc.on('exit', () => resolve());
        setTimeout(() => {
          proc.kill('SIGKILL');
          resolve();
        }, 3000);
      });
      await sleep(500);
    },
  };
}

describe('chrome extension bridge mode start/stop (#2119)', () => {
  let agent: ComputerAgent;
  let extId: string;
  const extensionPath = path.resolve(
    __dirname,
    '../../../../apps/chrome-extension/dist',
  );

  beforeAll(async () => {
    agent = await agentFromComputer({
      aiActionContext:
        'Chrome browser with Midscene.js extension loaded. The target page is a TodoMVC app. The extension side panel is on the right side. The main page content is on the left.',
    });
    await launchChromeWithExtension(
      extensionPath,
      'https://todomvc.com/examples/react/dist/',
    );
    extId = await readExtensionId();
    console.log('Extension ID:', extId);
  });

  // ── Setup: open side panel and switch to Bridge Mode ─────────────────

  it('open side panel and switch to Bridge Mode', async () => {
    await agent.aiAct(
      'Click the puzzle piece icon (Extensions button) in the top-right area of the Chrome toolbar',
    );
    await sleep(1000);

    await agent.aiAct('Click "Midscene.js" in the extensions dropdown list');
    await sleep(3000);

    await agent.aiAssert(
      'The browser shows a side panel on the right side containing Midscene or Playground UI',
    );

    // Inject env config and bridge permission (auto-allow connections)
    await injectExtensionConfig(extId);
    await injectBridgePermission(extId);
    const target = await findExtensionPageTarget(extId);
    if (target?.webSocketDebuggerUrl) {
      await reloadViaWebSocket(target.webSocketDebuggerUrl);
      await sleep(3000);
    }

    // Switch to Bridge Mode
    const switchToBridge = async () => {
      await agent.aiAct(
        `In ${SIDE_PANEL}, find and click the hamburger menu icon (three horizontal lines "≡") at the top-left corner. It should open a dropdown menu.`,
      );
      await sleep(2000);
      await agent.aiAct(
        'In the dropdown menu that just appeared, click the menu item labeled "Bridge Mode" which has an API icon next to it',
      );
      await sleep(3000);
    };

    await switchToBridge();
    try {
      await agent.aiAssert(
        `${SIDE_PANEL} shows Bridge mode UI with "Bridge Mode" title and a "Stop" button at the bottom`,
      );
    } catch {
      console.log('Bridge mode switch failed, retrying...');
      await switchToBridge();
      await agent.aiAssert(
        `${SIDE_PANEL} shows Bridge mode UI with "Bridge Mode" title and a "Stop" button at the bottom`,
      );
    }
  });

  // ── Test: bridge connects to a real server ────────────────────────────

  it('bridge connects to a real server and shows Connected', async () => {
    // Extension auto-starts listening, retries every 3s on ws://localhost:3766
    // Start a bridge server — extension should connect within ~15s
    const server = await startBridgeServer();

    const connected = await server.waitForConnected(15000);
    expect(connected).toBe(true);

    // Verify the UI shows "Connected"
    await agent.aiAssert(`${SIDE_PANEL} bottom area shows "Connected"`);

    // Kill the server so we can test stop behavior
    await server.kill();
  });

  // ── Test: stop bridge ─────────────────────────────────────────────────

  it('stop bridge and verify Stopped status', async () => {
    await agent.aiAct(`Click the "Stop" button at the bottom of ${SIDE_PANEL}`);
    await sleep(2000);

    await agent.aiAssert(
      `${SIDE_PANEL} bottom area shows "Stopped" and a "Start" button`,
    );
  });

  // ── Test: after stop, server gets no connection ───────────────────────

  it('after stop, a new server gets no connection', async () => {
    const server = await startBridgeServer();

    // Wait 10s — extension should NOT connect because bridge is stopped
    const connected = await server.waitForConnected(10000);
    expect(connected).toBe(false);

    console.log('[Test] Confirmed: no connection while bridge is stopped');
    await server.kill();
  });

  // ── Test: restart and connect again ───────────────────────────────────

  it('restart bridge and connect to server again', async () => {
    // Start a new server before clicking Start
    const server = await startBridgeServer();

    // Click Start in the UI
    await agent.aiAct(
      `Click the "Start" button at the bottom of ${SIDE_PANEL}`,
    );
    await sleep(2000);

    // Verify UI shows "Listening"
    await agent.aiAssert(
      `${SIDE_PANEL} bottom area shows "Listening" or "Connected"`,
    );

    // Wait for actual connection
    const connected = await server.waitForConnected(15000);
    expect(connected).toBe(true);

    // Wait for UI to update after WebSocket connection
    await sleep(3000);

    // Verify UI shows "Connected"
    await agent.aiAssert(`${SIDE_PANEL} bottom area shows "Connected"`);

    await server.kill();
  });
});
