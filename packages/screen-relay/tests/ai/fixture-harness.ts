import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Size } from '@midscene/core';

const FIXTURE_HTML_PATH = path.join(__dirname, 'fixtures/desktop-fixture.html');

export interface FixtureTargets {
  input: [number, number];
  hover: [number, number];
  dblclick: [number, number];
  rightclick: [number, number];
  scroll: [number, number];
  dragSource: [number, number];
  dropTarget: [number, number];
}

export interface FixtureEvent {
  type: string;
  value?: string;
  scrollTop?: number;
  scrollLeft?: number;
}

export interface RunningDesktopFixture {
  events: FixtureEvent[];
  targets: FixtureTargets;
  stop(): Promise<void>;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor(
  predicate: () => boolean,
  description: string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${description}`);
    }
    await sleep(50);
  }
}

function resolveBrowserExecutable(): string {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'chromium',
    'chromium-browser',
    'google-chrome-stable',
    'google-chrome',
  ].filter((c): c is string => Boolean(c));

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    try {
      const resolved = execFileSync('which', [candidate], {
        encoding: 'utf8',
      }).trim();
      if (resolved) return resolved;
    } catch {
      // try next
    }
  }
  throw new Error(
    'No Chromium/Chrome executable found. Set PUPPETEER_EXECUTABLE_PATH or install chromium.',
  );
}

function resolveScreenRelayBin(): string {
  if (process.env.MIDSCENE_SCREEN_RELAY_BIN) {
    return process.env.MIDSCENE_SCREEN_RELAY_BIN;
  }
  const localBin = path.resolve(
    __dirname,
    '../../node_modules/.bin/screen-relay',
  );
  if (existsSync(localBin)) return localBin;
  return 'screen-relay';
}

export async function startDesktopFixture(
  screenSize: Size,
): Promise<RunningDesktopFixture> {
  const events: FixtureEvent[] = [];
  let targets: FixtureTargets | undefined;
  const html = readFileSync(FIXTURE_HTML_PATH, 'utf8');

  const server: Server = createServer((req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    if (
      req.method === 'POST' &&
      (reqUrl.pathname === '/ready' || reqUrl.pathname === '/event')
    ) {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (reqUrl.pathname === '/ready') {
            targets = payload.targets as FixtureTargets;
          } else {
            events.push(payload as FixtureEvent);
          }
        } catch {
          // ignore malformed payload
        }
        res.writeHead(204).end();
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Fixture server failed to bind a TCP port');
  }

  const profileDir = path.join(
    tmpdir(),
    `midscene-sr-ai-${process.pid}-${Date.now()}`,
  );
  let browserPid: number | undefined;

  const stop = async () => {
    if (browserPid) {
      try {
        process.kill(browserPid, 'SIGTERM');
      } catch {
        // already exited
      }
      browserPid = undefined;
    }
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
    rmSync(profileDir, { force: true, recursive: true });
  };

  try {
    const browserBin = resolveBrowserExecutable();
    const srBin = resolveScreenRelayBin();
    const pidOut = execFileSync(
      srBin,
      [
        'run',
        '--',
        browserBin,
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--kiosk',
        '--window-position=0,0',
        `--window-size=${screenSize.width},${screenSize.height}`,
        `--user-data-dir=${profileDir}`,
        `http://127.0.0.1:${addr.port}`,
      ],
      { encoding: 'utf8' },
    ).trim();
    const parsed = Number.parseInt(pidOut, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      browserPid = parsed;
    }

    await waitFor(() => Boolean(targets), 'browser fixture /ready');
    return {
      events,
      targets: targets!,
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
