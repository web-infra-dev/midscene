import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
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
import { afterAll, beforeAll, describe, expect, it } from '@rstest/core';

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CLI Viewport Test</title>
  </head>
  <body>
    <main id="app">viewport test</main>
    <script>
      fetch('/viewport-metrics?' + new URLSearchParams({
        innerWidth: String(window.innerWidth),
        innerHeight: String(window.innerHeight),
        clientWidth: String(document.documentElement.clientWidth),
        clientHeight: String(document.documentElement.clientHeight),
      }));
    </script>
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
  let reportedMetrics: Record<string, number> | undefined;

  beforeAll(async () => {
    persistentRoot = mkdtempSync(join(tmpdir(), 'midscene-cli-viewport-'));
    persistence = {
      endpointFile: join(persistentRoot, 'endpoint'),
      userDataDir: join(persistentRoot, 'profile'),
      targetIdFile: join(persistentRoot, 'target-id'),
    };

    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/viewport-metrics') {
        reportedMetrics = Object.fromEntries(
          [...url.searchParams].map(([key, value]) => [key, Number(value)]),
        );
        res.writeHead(204);
        res.end();
        return;
      }
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
        maxRetries: 10,
        retryDelay: 200,
      });
    }
  });

  it('applies CLI viewport flags to the launched Puppeteer page', async () => {
    reportedMetrics = undefined;
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
    await runToolsCLI(tools, 'midscene-web', {
      stripPrefix: 'web_',
      argv: parsedOptions.argv,
    });

    // Measure during the CLI session. Disconnecting its CDP client may clear
    // viewport emulation; a later connection measures the native window instead.
    await expect
      .poll(() => reportedMetrics)
      .toEqual({
        innerWidth: width,
        innerHeight: height,
        clientWidth: width,
        clientHeight: height,
      });
  }, 60_000);
});
