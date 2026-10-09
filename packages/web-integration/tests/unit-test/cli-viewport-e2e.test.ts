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
import { runToolsCLI } from '@midscene/shared/cli';
import { afterAll, beforeAll, describe, expect, it, rs } from '@rstest/core';
import puppeteer from 'puppeteer-core';

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
});
