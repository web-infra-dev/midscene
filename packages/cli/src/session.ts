import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer';

export const puppeteerBrowserManager = {
  endpointFile: join(tmpdir(), 'midscene-puppeteer-endpoint'),
  activeBrowser: null as Browser | null,

  hasActiveSession(): boolean {
    return existsSync(this.endpointFile);
  },

  async getOrLaunch(opts?: {
    headless?: boolean;
  }): Promise<{ browser: Browser; reused: boolean }> {
    if (existsSync(this.endpointFile)) {
      try {
        const endpoint = (await readFile(this.endpointFile, 'utf-8')).trim();
        const browser = await puppeteer.connect({
          browserWSEndpoint: endpoint,
          defaultViewport: null,
        });
        return { browser, reused: true };
      } catch {
        try { await unlink(this.endpointFile); } catch {}
      }
    }

    const wsEndpoint = await this.launchDetachedChrome({ headless: opts?.headless });
    await writeFile(this.endpointFile, wsEndpoint);

    const browser = await puppeteer.connect({
      browserWSEndpoint: wsEndpoint,
      defaultViewport: null,
    });
    return { browser, reused: false };
  },

  async closeBrowser(): Promise<void> {
    if (!existsSync(this.endpointFile)) return;
    try {
      const endpoint = (await readFile(this.endpointFile, 'utf-8')).trim();
      const browser = await puppeteer.connect({ browserWSEndpoint: endpoint });
      await browser.close();
    } catch {}
    try { await unlink(this.endpointFile); } catch {}
  },

  disconnect(): void {
    if (this.activeBrowser) {
      this.activeBrowser.disconnect();
      this.activeBrowser = null;
    }
  },

  async launchDetachedChrome(opts?: { headless?: boolean }): Promise<string> {
    const chromePath = puppeteer.executablePath();
    const headless = opts?.headless ?? true;
    const args = [
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-background-networking',
      '--password-store=basic',
      '--use-mock-keychain',
      '--window-size=1280,800',
      '--force-color-profile=srgb',
    ];

    if (headless) {
      args.push('--headless=new');
    }

    const proc = spawn(chromePath, args, {
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    proc.unref();

    return new Promise<string>((resolve, reject) => {
      let output = '';
      const onData = (data: Buffer) => {
        output += data.toString();
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          proc.stderr!.removeListener('data', onData);
          resolve(match[1]);
        }
      };
      proc.stderr!.on('data', onData);
      setTimeout(() => reject(new Error('Chrome launch timeout')), 15000);
    });
  },
};
