import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  WebPuppeteerMidsceneTools,
  buildDetachedChromeArgs,
  waitForDetachedChromeEndpoint,
} from '@/agent-tools-puppeteer';
import {
  defaultPuppeteerWindowViewportSize,
  defaultStaticPageViewportSize,
} from '@/common/viewport';
import { describe, expect, it } from '@rstest/core';

describe('WebPuppeteerMidsceneTools', () => {
  it('keeps a child process alive when it continues writing stderr after endpoint discovery', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-chrome-stderr-'));
    const stderrFile = join(root, 'chrome-stderr.log');
    const stderrFd = openSync(stderrFile, 'w');
    const proc = spawn(
      process.execPath,
      [
        '-e',
        `
          process.stderr.write('DevTools listening on ws://127.0.0.1:9222/devtools/browser/test\\n');
          let count = 0;
          const timer = setInterval(() => {
            count += 1;
            process.stderr.write('runtime log ' + count + '\\n');
            if (count === 3) {
              clearInterval(timer);
              process.stdout.write('alive\\n');
              setTimeout(() => process.exit(0), 20);
            }
          }, 20);
        `,
      ],
      { stdio: ['ignore', 'pipe', stderrFd] },
    );
    const endpointPromise = waitForDetachedChromeEndpoint(
      proc,
      stderrFile,
      1_000,
    );
    closeSync(stderrFd);

    try {
      const alivePromise = once(proc.stdout!, 'data', {
        signal: AbortSignal.timeout(1_000),
      });
      const exitPromise = once(proc, 'exit', {
        signal: AbortSignal.timeout(1_000),
      });
      await expect(endpointPromise).resolves.toBe(
        'ws://127.0.0.1:9222/devtools/browser/test',
      );
      const [aliveOutput] = await alivePromise;
      const [exitCode, signal] = await exitPromise;

      expect(aliveOutput.toString()).toContain('alive');
      expect(exitCode).toBe(0);
      expect(signal).toBeNull();
      expect(readFileSync(stderrFile, 'utf-8')).toContain('runtime log 3');
    } finally {
      if (proc.exitCode === null && proc.signalCode === null) {
        const exitPromise = once(proc, 'exit');
        proc.kill('SIGTERM');
        await exitPromise;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('builds detached Chrome args from the configured viewport', () => {
    const args = buildDetachedChromeArgs({
      userDataDir: '/tmp/midscene-profile',
      viewport: { width: 1720, height: 980 },
    });

    expect(args).toContain('--window-size=1720,980');
    expect(args).toContain('--headless=new');
  });

  it('keeps the main branch detached Chrome window default', () => {
    const args = buildDetachedChromeArgs({
      userDataDir: '/tmp/midscene-profile',
    });

    expect(args).toContain(
      `--window-size=${defaultPuppeteerWindowViewportSize.width},${defaultPuppeteerWindowViewportSize.height}`,
    );
  });

  it('uses the configured viewport for the temporary device placeholder', async () => {
    const tools = new WebPuppeteerMidsceneTools({ width: 1680, height: 1050 });

    const device = (tools as any).createTemporaryDevice();
    await expect(device.size()).resolves.toEqual({
      width: 1680,
      height: 1050,
    });
  });

  it('keeps the main branch static device default for the default constructor', async () => {
    const tools = new WebPuppeteerMidsceneTools();

    const device = (tools as any).createTemporaryDevice();
    await expect(device.size()).resolves.toEqual(defaultStaticPageViewportSize);
  });
});
