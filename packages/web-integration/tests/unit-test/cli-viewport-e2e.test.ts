import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
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
import { imageInfoOfBase64 } from '@midscene/shared/img';
import { afterAll, beforeAll, describe, expect, it, rs } from '@rstest/core';

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

async function removePersistentRoot(root: string): Promise<void> {
  // Chrome may still write profile files after web_close returns. Retry the
  // entire removal so new files get removed on the next attempt.
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      rmSync(root, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt === 9 || (code !== 'ENOTEMPTY' && code !== 'EBUSY')) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
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
      await removePersistentRoot(persistentRoot);
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
    const consoleSpy = rs.spyOn(console, 'log').mockImplementation(() => {});
    let screenshotPath: string | undefined;
    try {
      await runToolsCLI(tools, 'midscene-web', {
        stripPrefix: 'web_',
        argv: parsedOptions.argv,
      });

      const screenshotMessage = consoleSpy.mock.calls
        .map(([message]) => String(message))
        .find((message) => message.startsWith('Screenshot saved: '));
      if (!screenshotMessage) {
        throw new Error('CLI did not save a screenshot of the connected page');
      }
      screenshotPath = screenshotMessage.slice('Screenshot saved: '.length);
      const screenshot = await readFile(screenshotPath);
      expect(await imageInfoOfBase64(screenshot.toString('base64'))).toEqual({
        width,
        height,
      });
    } finally {
      consoleSpy.mockRestore();
      if (screenshotPath) {
        rmSync(screenshotPath, { force: true });
      }
    }
  }, 60_000);
});
