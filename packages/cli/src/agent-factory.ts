import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Platform } from './global-options';
import { puppeteerBrowserManager } from './session';

export interface AgentOptions {
  platform: Platform;
  bridge?: boolean;
  url?: string;
  device?: string;
  display?: string;
  headed?: boolean;
}

export async function createPlatformAgent(platform: Platform, opts: AgentOptions) {
  switch (platform) {
    case 'computer': {
      const { agentFromComputer } = await import('@midscene/computer');
      return agentFromComputer(
        opts.display ? { displayId: opts.display } : undefined,
      );
    }
    case 'web': {
      if (opts.bridge) {
        const { AgentOverChromeBridge } = await import('@midscene/web/bridge-mode');
        const agent = new AgentOverChromeBridge({ closeConflictServer: true });
        if (opts.url) {
          await agent.connectNewTabWithUrl(opts.url);
        } else {
          await agent.connectCurrentTab();
        }
        return agent;
      }

      const headless = !opts.headed;
      const { browser, reused } = await puppeteerBrowserManager.getOrLaunch({
        headless,
      });
      puppeteerBrowserManager.activeBrowser = browser;
      const pages = await browser.pages();

      const { PuppeteerAgent } = await import('@midscene/web/puppeteer');
      let page: import('puppeteer').Page;

      if (opts.url) {
        page = await browser.newPage();
        await page.goto(opts.url, { timeout: 30000, waitUntil: 'domcontentloaded' });
      } else {
        const webPages = pages.filter((p) => /^https?:\/\//.test(p.url()));
        page =
          webPages.length > 0
            ? webPages[webPages.length - 1]
            : pages[pages.length - 1] || (await browser.newPage());

        if (reused) {
          await page.bringToFront();
        }
      }

      return new PuppeteerAgent(page);
    }
    case 'android': {
      const { agentFromAdbDevice } = await import('@midscene/android');
      return agentFromAdbDevice(opts.device);
    }
    case 'ios': {
      const { agentFromWebDriverAgent } = await import('@midscene/ios');
      return agentFromWebDriverAgent();
    }
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

export function destroyAgent(platform: Platform, agent: any, bridge?: boolean): void {
  const keepBrowserAlive = platform === 'web' && !bridge;
  if (keepBrowserAlive) {
    puppeteerBrowserManager.disconnect();
  } else {
    try { agent.destroy(); } catch {}
  }
}

export async function saveScreenshot(base64: string): Promise<string> {
  const dir = join(tmpdir(), 'midscene-screenshots');
  await mkdir(dir, { recursive: true });
  const filename = `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  const filepath = join(dir, filename);

  const raw = base64.replace(/^data:image\/\w+;base64,/, '');
  await writeFile(filepath, Buffer.from(raw, 'base64'));
  return filepath;
}

export async function captureScreenshot(agent: { page?: { screenshotBase64?: () => Promise<string> } }): Promise<string | undefined> {
  const base64 = await agent.page?.screenshotBase64?.();
  return base64 ? saveScreenshot(base64) : undefined;
}
