import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, rmSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from '@rstest/core';
import { ComputerDevice } from '../../src';
import { findLinuxBrowser, isHeadlessLinux } from './test-utils';

const FIXTURE_PATH = path.join(__dirname, 'fixtures/linux-drag-and-drop.html');
const SOURCE_CENTER = { x: 360, y: 400 };
const TARGET_CENTER = { x: 360, y: 130 };

async function waitFor(
  predicate: () => boolean,
  description: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${description}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe.runIf(isHeadlessLinux())('Linux drag and drop', () => {
  let browser: ChildProcess | undefined;
  let device: ComputerDevice | undefined;
  let server: Server | undefined;
  let browserProfile: string | undefined;

  afterEach(async () => {
    if (browser && browser.exitCode === null) {
      browser.kill('SIGTERM');
      await Promise.race([
        once(browser, 'exit'),
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ]);
    }
    await device?.destroy();
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => (error ? reject(error) : resolve()));
      });
    }
    if (browserProfile) {
      rmSync(browserProfile, { force: true, recursive: true });
    }
  });

  it('delivers a held-pointer motion after drag activation', async () => {
    const observedEvents = new Set<string>();
    const fixture = readFileSync(FIXTURE_PATH, 'utf8');
    server = createServer((request, response) => {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/event') {
        observedEvents.add(url.searchParams.get('name') || 'unknown');
        response.writeHead(204).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(fixture);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Drag fixture server did not bind a TCP port');
    }

    device = new ComputerDevice({ headless: true });
    await device.connect();

    browserProfile = path.join(
      tmpdir(),
      `midscene-linux-drag-${process.pid}-${Date.now()}`,
    );
    browser = spawn(
      findLinuxBrowser(),
      [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--kiosk',
        '--window-position=0,0',
        '--window-size=1920,1080',
        `--user-data-dir=${browserProfile}`,
        `http://127.0.0.1:${address.port}`,
      ],
      { env: process.env, stdio: 'ignore' },
    );

    await waitFor(() => observedEvents.has('ready'), 'browser fixture');
    await device.inputPrimitives.pointer!.dragAndDrop(
      SOURCE_CENTER,
      TARGET_CENTER,
    );
    await waitFor(
      () => observedEvents.has('dropped') || observedEvents.has('drop-missed'),
      'drag result',
    );

    expect([...observedEvents]).toContain('drag-started');
    expect([...observedEvents]).toContain('target-observed');
    expect([...observedEvents]).toContain('dropped');
    expect([...observedEvents]).not.toContain('drop-missed');
  });
});
