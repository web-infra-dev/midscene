import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import {
  WebPuppeteerMidsceneTools,
  buildDetachedChromeArgs,
  waitForDetachedChromeEndpoint,
} from '@/agent-tools-puppeteer';
import {
  defaultPuppeteerWindowViewportSize,
  defaultStaticPageViewportSize,
} from '@/common/viewport';
import { describe, expect, it } from 'vitest';

describe('WebPuppeteerMidsceneTools', () => {
  it('releases the Chrome stderr pipe after reading the DevTools endpoint', async () => {
    const stderr = new PassThrough();
    const proc = Object.assign(new EventEmitter(), {
      stderr,
      killed: false,
      exitCode: null,
      signalCode: null,
    }) as unknown as ChildProcess;
    const endpointPromise = waitForDetachedChromeEndpoint(proc, 1_000);

    stderr.write(
      'Chrome startup log\nDevTools listening on ws://127.0.0.1:9222/devtools/browser/test\n',
    );

    await expect(endpointPromise).resolves.toBe(
      'ws://127.0.0.1:9222/devtools/browser/test',
    );
    expect(stderr.destroyed).toBe(true);
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
