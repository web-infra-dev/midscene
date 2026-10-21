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

interface BrowserGeometry {
  source: { x: number; y: number };
  target: { x: number; y: number };
  viewport: { left: number; top: number };
  window: {
    innerWidth: number;
    innerHeight: number;
    outerWidth: number;
    outerHeight: number;
  };
}

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
    const observedEvents: string[] = [];
    let browserGeometry: BrowserGeometry | undefined;
    let browserStderr = '';
    const fixture = readFileSync(FIXTURE_PATH, 'utf8');
    server = createServer((request, response) => {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/ready') {
        browserGeometry = {
          source: {
            x: Number(url.searchParams.get('sourceX')),
            y: Number(url.searchParams.get('sourceY')),
          },
          target: {
            x: Number(url.searchParams.get('targetX')),
            y: Number(url.searchParams.get('targetY')),
          },
          viewport: {
            left: Number(url.searchParams.get('left')),
            top: Number(url.searchParams.get('top')),
          },
          window: {
            innerWidth: Number(url.searchParams.get('innerWidth')),
            innerHeight: Number(url.searchParams.get('innerHeight')),
            outerWidth: Number(url.searchParams.get('outerWidth')),
            outerHeight: Number(url.searchParams.get('outerHeight')),
          },
        };
        response.writeHead(204).end();
        return;
      }
      if (url.pathname === '/event') {
        observedEvents.push(url.searchParams.toString());
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
      return !!browserGeometry;
    }, 'browser fixture');
    const { source, target } = browserGeometry!;
    await device.inputPrimitives.pointer!.dragAndDrop(source, target);
    try {
      await waitFor(
        () =>
          observedEvents.some(
            (event) =>
              event.startsWith('name=dropped') ||
              event.startsWith('name=drop-missed'),
          ),
        'drag result',
      );
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}; geometry=${JSON.stringify(browserGeometry)}; events=${JSON.stringify(observedEvents)}; browserStderr=${browserStderr}`,
      );
    }

    const eventNames = observedEvents.map(
      (event) => new URLSearchParams(event).get('name') || 'unknown',
    );
    expect(eventNames).toContain('drag-started');
    expect(eventNames).toContain('target-observed');
    expect(eventNames).toContain('dropped');
    expect(eventNames).not.toContain('drop-missed');
  });
});
