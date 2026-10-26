import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type PuppeteerPersistenceOptions,
  WebPuppeteerMidsceneTools,
} from '@/agent-tools-puppeteer';
import { parseWebCliOptions } from '@/cli-options';
import type { PuppeteerBrowserAgent } from '@/puppeteer';
import { runToolsCLI } from '@midscene/shared/cli';
import { afterAll, beforeAll, describe, expect, it, rs } from '@rstest/core';
import puppeteer, { type Page } from 'puppeteer-core';

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CLI Viewport Test</title>
  </head>
  <body>
    <main id="app">viewport test</main>
  </body>
</html>`;

async function closePersistentBrowser(
  persistence: PuppeteerPersistenceOptions,
): Promise<void> {
  const tools = new WebPuppeteerMidsceneTools(undefined, { persistence });
  await tools.initTools();
  const closeTool = tools
    .getToolDefinitions()
    .find((tool) => tool.name === 'web_close');

  if (!closeTool) {
    throw new Error('web_close tool is required for cleanup');
  }

  await closeTool.handler({});
  await tools.destroy();
}

describe('midscene-web CLI viewport e2e', () => {
  let server: Server;
  let baseUrl: string;
  let persistentRoot: string;
  let persistence: Required<PuppeteerPersistenceOptions>;

  beforeAll(async () => {
    persistentRoot = mkdtempSync(join(tmpdir(), 'midscene-cli-viewport-'));
    persistence = {
      endpointFile: join(persistentRoot, 'endpoint'),
      userDataDir: join(persistentRoot, 'profile'),
      targetIdFile: join(persistentRoot, 'target-id'),
    };

    server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    await closePersistentBrowser(persistence);
  });

  afterAll(async () => {
    try {
      await closePersistentBrowser(persistence);
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    } finally {
      // Chrome may still be flushing profile files shortly after web_close
      // returns, so retry the recursive cleanup for transient ENOTEMPTY errors.
      await rm(persistentRoot, {
        recursive: true,
        force: true,
        maxRetries: 2,
        retryDelay: 1000,
      });
    }
  });

  it('preserves parent and popup state across separate CLI invocations', async () => {
    const invoke = async (argv: string[]) => {
      const tools = new WebPuppeteerMidsceneTools(undefined, { persistence });
      await runToolsCLI(tools, 'midscene-web', { stripPrefix: 'web_', argv });
    };
    class InspectableTools extends WebPuppeteerMidsceneTools {
      connectAgent(): Promise<PuppeteerBrowserAgent> {
        return this.ensureAgent();
      }
    }
    const readSelectedPageUrl = async () => {
      const tools = new InspectableTools(undefined, { persistence });
      try {
        return await (await tools.connectAgent()).page.evaluate(
          'window.location.href',
        );
      } finally {
        await tools.destroy();
      }
    };
    await invoke(['connect', '--url', `${baseUrl}/parent`]);
    const parentId = (await readFile(persistence.targetIdFile, 'utf-8')).trim();
    const browser = await puppeteer.connect({
      browserWSEndpoint: (
        await readFile(persistence.endpointFile, 'utf-8')
      ).trim(),
      defaultViewport: null,
    });
    try {
      const parent = (await browser.pages()).find(
        (page) => page.url() === `${baseUrl}/parent`,
      )!;
      // Keep the CLI agent connected while the popup is created, so this also
      // catches regressions to PageAgent's forced same-tab navigation.
      const tools = new WebPuppeteerMidsceneTools(undefined, { persistence });
      await tools.initTools();
      const tabs = tools
        .getToolDefinitions()
        .find((tool) => tool.name === 'web_tabs')!;
      await tabs.handler({});
      try {
        await parent.evaluate(
          `document.body.innerHTML = '<input id="value" value="parent state"><a id="open" target="_blank" href="/child">Open</a>'`,
        );
        const popupEvent = new Promise<Page>((resolve) =>
          parent.once('popup', (page) => {
            if (page) resolve(page);
          }),
        );
        await parent.click('#open');
        const child = await popupEvent;
        await child.waitForSelector('#app');
        expect(parent.url()).toBe(`${baseUrl}/parent`);
        expect(child.isClosed()).toBe(false);
        const result = await tabs.handler({});
        const summaries = JSON.parse(
          (result.content[0] as { text: string }).text,
        );
        const childId = summaries.find(
          (tab: { url: string }) => tab.url === `${baseUrl}/child`,
        ).id;
        expect(
          summaries.find((tab: { id: string }) => tab.id === parentId).active,
        ).toBe(true);
        await tools.destroy();

        await invoke(['switch-tab', '--id', childId]);
        expect(await readSelectedPageUrl()).toBe(`${baseUrl}/child`);
        expect((await readFile(persistence.targetIdFile, 'utf-8')).trim()).toBe(
          childId,
        );
        await invoke(['tabs']);
        expect((await readFile(persistence.targetIdFile, 'utf-8')).trim()).toBe(
          childId,
        );
        await child.evaluate(
          `document.querySelector('#app').textContent = 'child state'`,
        );
        await invoke(['switch-tab', '--id', parentId]);
        expect(await readSelectedPageUrl()).toBe(`${baseUrl}/parent`);
        await invoke(['tabs']);
        expect((await readFile(persistence.targetIdFile, 'utf-8')).trim()).toBe(
          parentId,
        );
        expect(
          await parent.$eval(
            '#value',
            (element) => (element as HTMLInputElement).value,
          ),
        ).toBe('parent state');
        expect(
          await child.$eval('#app', (element) => element.textContent),
        ).toBe('child state');
        await child.close();
        // Invoke the handler directly so the CLI error exit cannot kill the test worker.
        const invalidTools = new WebPuppeteerMidsceneTools(undefined, {
          persistence,
        });
        await invalidTools.initTools();
        try {
          const switchTab = invalidTools
            .getToolDefinitions()
            .find((tool) => tool.name === 'web_switch-tab')!;
          await expect(switchTab.handler({ id: childId })).rejects.toThrow(
            'does not exist or has closed',
          );
          expect(
            (await readFile(persistence.targetIdFile, 'utf-8')).trim(),
          ).toBe(parentId);
        } finally {
          await invalidTools.destroy();
        }
      } finally {
        await tools.destroy();
      }
    } finally {
      browser.disconnect();
    }
  }, 60_000);

  it('applies CLI viewport flags to the launched Puppeteer page', async () => {
    const width = 1536;
    const height = 864;
    const parsedOptions = parseWebCliOptions([
      '--viewport-width',
      String(width),
      '--viewport-height',
      String(height),
      'connect',
      '--url',
      baseUrl,
    ]);

    const tools = new WebPuppeteerMidsceneTools(parsedOptions.viewport, {
      persistence,
    });
    let metrics:
      | {
          innerWidth: number;
          innerHeight: number;
          clientWidth: number;
          clientHeight: number;
        }
      | undefined;
    const destroy = tools.destroy.bind(tools);
    // Inspect while the CLI's emulated viewport is active. Disconnecting
    // restores Chrome's native window size, which includes browser UI.
    const destroySpy = rs
      .spyOn(tools, 'destroy')
      .mockImplementation(async () => {
        try {
          const endpoint = (
            await readFile(persistence.endpointFile, 'utf-8')
          ).trim();
          const browser = await puppeteer.connect({
            browserWSEndpoint: endpoint,
            defaultViewport: null,
          });
          try {
            const pages = await browser.pages();
            const page = pages.find(
              (item) => item.url() === `${baseUrl}/` || item.url() === baseUrl,
            );

            if (!page) {
              throw new Error(`Failed to find connected page for ${baseUrl}`);
            }

            metrics = await page.evaluate(() => ({
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              clientWidth: document.documentElement.clientWidth,
              clientHeight: document.documentElement.clientHeight,
            }));
          } finally {
            browser.disconnect();
          }
        } finally {
          await destroy();
        }
      });

    try {
      await runToolsCLI(tools, 'midscene-web', {
        stripPrefix: 'web_',
        argv: parsedOptions.argv,
      });
      expect(metrics).toEqual({
        innerWidth: width,
        innerHeight: height,
        clientWidth: width,
        clientHeight: height,
      });
      expect(destroySpy).toHaveBeenCalledTimes(1);
    } finally {
      destroySpy.mockRestore();
    }
  }, 60_000);

  it.each([
    [1536, 864],
    [1280, 720],
  ])(
    'preserves CLI viewport %i x %i after reconnect',
    async (width, height) => {
      const targetUrl = `${baseUrl}/?viewport=${width}x${height}`;
      const parsedOptions = parseWebCliOptions([
        '--viewport-width',
        String(width),
        '--viewport-height',
        String(height),
        'connect',
        '--url',
        targetUrl,
      ]);

      const tools = new WebPuppeteerMidsceneTools(parsedOptions.viewport, {
        persistence,
      });
      await runToolsCLI(tools, 'midscene-web', {
        stripPrefix: 'web_',
        argv: parsedOptions.argv,
      });

      const endpoint = (
        await readFile(persistence.endpointFile, 'utf-8')
      ).trim();
      const browser = await puppeteer.connect({
        browserWSEndpoint: endpoint,
        defaultViewport: null,
      });

      try {
        const pages = await browser.pages();
        const page = pages.find((item) => item.url() === targetUrl);

        if (!page) {
          throw new Error(`Failed to find connected page for ${baseUrl}`);
        }

        await page.setViewport(null);
        const metrics = await page.evaluate(() => ({
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          clientWidth: document.documentElement.clientWidth,
          clientHeight: document.documentElement.clientHeight,
        }));

        expect(metrics).toEqual({
          innerWidth: width,
          innerHeight: height,
          clientWidth: width,
          clientHeight: height,
        });
      } finally {
        browser.disconnect();
      }
    },
    60_000,
  );
});
