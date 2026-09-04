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
const SOURCE_CENTER_IN_VIEWPORT = { x: 360, y: 400 };
const TARGET_CENTER_IN_VIEWPORT = { x: 360, y: 130 };

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
    let viewportOrigin: { x: number; y: number } | undefined;
    let browserStderr = '';
    const fixture = readFileSync(FIXTURE_PATH, 'utf8');
    server = createServer((request, response) => {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/ready') {
        viewportOrigin = {
          x: Number(url.searchParams.get('left')),
          y: Number(url.searchParams.get('top')),
        };
        response.writeHead(204).end();
        return;
      }
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
      process.env.PUPPETEER_EXECUTABLE_PATH || findLinuxBrowser(),
      [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--window-position=0,0',
        '--window-size=1920,1080',
        '--start-maximized',
        `--user-data-dir=${browserProfile}`,
        `http://127.0.0.1:${address.port}`,
      ],
      { env: process.env, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    browser.stderr?.on('data', (chunk: Buffer) => {
      browserStderr += chunk.toString();
    });

    await waitFor(() => {
      if (browser?.exitCode !== null) {
        throw new Error(
          `Browser exited before loading the fixture (code=${browser?.exitCode}): ${browserStderr}`,
        );
      }
      return !!viewportOrigin;
    }, 'browser fixture');
    const source = {
      x: viewportOrigin!.x + SOURCE_CENTER_IN_VIEWPORT.x,
      y: viewportOrigin!.y + SOURCE_CENTER_IN_VIEWPORT.y,
    };
    const target = {
      x: viewportOrigin!.x + TARGET_CENTER_IN_VIEWPORT.x,
      y: viewportOrigin!.y + TARGET_CENTER_IN_VIEWPORT.y,
    };
    await device.inputPrimitives.pointer!.dragAndDrop(source, target);
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
