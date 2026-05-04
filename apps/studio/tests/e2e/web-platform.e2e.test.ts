import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const STUDIO_ROOT = path.resolve(__dirname, '..', '..');
const MAIN_ENTRY = path.join(STUDIO_ROOT, 'dist/main/main.cjs');
const electronBinary = require('electron') as string;
const FIXTURE_BODY_HTML = '<h1 id="marker">midscene studio e2e marker</h1>';
const FIXTURE_TITLE = 'midscene-studio-e2e';
const FIXTURE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>${FIXTURE_TITLE}</title></head><body>${FIXTURE_BODY_HTML}</body></html>`;

interface CdpTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
}

interface PlaygroundBootstrapPayload {
  status: 'starting' | 'ready' | 'error';
  serverUrl: string | null;
  port: number | null;
  error: string | null;
}

interface PlaygroundSetupPayload {
  platformRegistry: Array<{ id: string }>;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Request to ${url} failed ${response.status}: ${text}`);
  }
  return (await response.json()) as T;
}

async function waitFor<T>(
  probe: () => Promise<T | null> | T | null,
  options: { timeoutMs: number; intervalMs?: number; message: string },
): Promise<T> {
  const interval = options.intervalMs ?? 250;
  const deadline = Date.now() + options.timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const result = await probe();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  const tail = lastError ? ` (last error: ${String(lastError)})` : '';
  throw new Error(`Timed out waiting for: ${options.message}${tail}`);
}

interface FixtureServer {
  url: (pathname: string) => string;
  close: () => Promise<void>;
}

async function startFixtureServer(): Promise<FixtureServer> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(FIXTURE_HTML);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Fixture server did not bind to a TCP address');
  }
  const port = address.port;
  return {
    url: (pathname) => `http://127.0.0.1:${port}${pathname}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function pickRandomPort(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

const ENABLE_E2E =
  process.env.STUDIO_E2E === '1' || process.env.STUDIO_E2E === 'true';

describe.skipIf(!ENABLE_E2E)('Studio web platform e2e', () => {
  let electronProcess: ChildProcessWithoutNullStreams | null = null;
  let cdpPort = 0;
  let fixture: FixtureServer | null = null;
  let studioRendererTarget: CdpTarget | null = null;

  beforeAll(async () => {
    fixture = await startFixtureServer();
    cdpPort = pickRandomPort(19224, 20224);

    electronProcess = spawn(electronBinary, [MAIN_ENTRY], {
      env: {
        ...process.env,
        MIDSCENE_STUDIO_CDP_PORT: String(cdpPort),
        // Suppress the verbose "insecure CSP" warning that bloats CI logs;
        // the warning is harmless in this dev/e2e context.
        ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    electronProcess.stdout?.on('data', (chunk) => {
      process.stderr.write(`[electron stdout] ${chunk}`);
    });
    electronProcess.stderr?.on('data', (chunk) => {
      process.stderr.write(`[electron stderr] ${chunk}`);
    });

    studioRendererTarget = await waitFor(
      async () => {
        const targets = await fetchJson<CdpTarget[]>(
          `http://127.0.0.1:${cdpPort}/json`,
        ).catch(() => null);
        if (!targets) return null;
        return (
          targets.find(
            (target) =>
              target.type === 'page' && target.title === 'Midscene Studio',
          ) ?? null
        );
      },
      {
        timeoutMs: 60_000,
        intervalMs: 500,
        message: 'Studio renderer page must appear on CDP',
      },
    );
  }, 90_000);

  afterAll(async () => {
    if (electronProcess && !electronProcess.killed) {
      electronProcess.kill('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 750));
      if (!electronProcess.killed) {
        electronProcess.kill('SIGKILL');
      }
    }
    if (fixture) {
      await fixture.close().catch(() => undefined);
    }
  });

  it('registers the web platform and creates a WebContentsView for the URL', async () => {
    if (!studioRendererTarget || !fixture) {
      throw new Error('beforeAll did not initialize fixtures');
    }
    type PuppeteerCoreModule = typeof import('puppeteer-core');
    const puppeteer: PuppeteerCoreModule = require('puppeteer-core');
    const browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${cdpPort}`,
      defaultViewport: null,
    });

    try {
      const pages = await browser.pages();
      const studioPage =
        pages.find((page) =>
          page.url().endsWith('/dist/renderer/index.html'),
        ) ?? pages[0];
      expect(
        studioPage,
        'Studio renderer page must be reachable',
      ).toBeDefined();
      if (!studioPage) throw new Error('studio page missing');

      // Ask the renderer (which holds the studioRuntime preload bridge) to
      // request the playground bootstrap. This also kicks the main process
      // into starting the playground HTTP server.
      const bootstrap = await waitFor<PlaygroundBootstrapPayload>(
        async () => {
          const data = await studioPage.evaluate(async () => {
            const api = (
              globalThis as unknown as {
                studioRuntime?: {
                  getPlaygroundBootstrap: () => Promise<unknown>;
                };
              }
            ).studioRuntime;
            if (!api) return null;
            return api.getPlaygroundBootstrap();
          });
          if (
            data &&
            typeof data === 'object' &&
            'status' in data &&
            (data as PlaygroundBootstrapPayload).status === 'ready'
          ) {
            return data as PlaygroundBootstrapPayload;
          }
          return null;
        },
        {
          timeoutMs: 45_000,
          intervalMs: 500,
          message: 'playground bootstrap must reach status=ready',
        },
      );

      expect(bootstrap.serverUrl).toMatch(/^http:\/\//);
      const serverUrl = bootstrap.serverUrl as string;

      const setup = await fetchJson<PlaygroundSetupPayload>(
        `${serverUrl}/session/setup`,
      );
      const platformIds = setup.platformRegistry.map((entry) => entry.id);
      expect(platformIds).toContain('web');

      const fixtureUrl = fixture.url('/fixture');
      const createResponse = await fetch(`${serverUrl}/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          platformId: 'web',
          'web.url': fixtureUrl,
        }),
      });
      const createBody = await createResponse.text();
      expect(
        createResponse.ok,
        `POST /session must succeed (status=${createResponse.status}): ${createBody}`,
      ).toBe(true);

      // The WebContentsView shows up as a brand-new CDP target whose URL
      // starts with the fixture URL once Chromium commits navigation.
      const fixtureTarget = await waitFor(
        async () => {
          const targets = browser.targets();
          return (
            targets.find(
              (target) =>
                target.type() === 'page' && target.url().startsWith(fixtureUrl),
            ) ?? null
          );
        },
        {
          timeoutMs: 30_000,
          intervalMs: 300,
          message: `web view target for ${fixtureUrl} must appear`,
        },
      );

      const fixturePage = await fixtureTarget.page();
      expect(fixturePage).toBeTruthy();
      if (!fixturePage) throw new Error('fixture page handle missing');
      const title = await fixturePage.title();
      expect(title).toBe(FIXTURE_TITLE);

      // Drive a real CDP action through puppeteer to prove the view is
      // actually controllable, not just visible to the target list.
      const markerText = await fixturePage.$eval(
        '#marker',
        (element) => element.textContent ?? '',
      );
      expect(markerText).toBe('midscene studio e2e marker');

      await fetch(`${serverUrl}/session`, { method: 'DELETE' }).catch(
        () => undefined,
      );
    } finally {
      await browser.disconnect();
    }
  }, 120_000);
});
